import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { deepseekClient } from '../lib/deepseek';
import { SuggestTripsResponse, PlanTripResponse, CityCatalog, CatalogEntry, SuggestCityAttractionsResponse, CompanionSuggestion } from '../types';
import type { AiSuggestBody, AiPlanBody, AiSuggestAttractionsBody, SuggestCompanionBody } from '../schemas/ai.schemas';

interface PromptsFile {
  suggest:            { system: string; userTemplate: string };
  plan:               { system: string; userTemplate: string };
  suggestAttractions: { system: string; userTemplate: string };
  companionSuggest:   { system: string; userTemplate: string };
}

function loadPrompts(): PromptsFile {
  const promptsPath = path.join(__dirname, '../../prompts/ai-trip-prompts.json');
  return JSON.parse(fs.readFileSync(promptsPath, 'utf-8')) as PromptsFile;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (msg, [key, value]) => msg.replaceAll(`{${key}}`, value),
    template,
  );
}

function buildCatalogBlock(catalog?: CityCatalog): string {
  if (!catalog || Object.keys(catalog).length === 0) {
    return 'IMPORTANTE: Usa kebab-case para cityId (ej: "paris", "newyork") y el formato {cityId}_N para attractionId (0 = atracción más famosa). Las fechas van en dd/mm/yyyy y los horarios en HH:mm.';
  }
  const lines = Object.entries(catalog).map(
    ([cityId, entries]) => `  ${cityId}: ${entries.map(e => `${e.id}=${e.name}`).join(', ')}`,
  );
  return [
    '<catalog>',
    'Usa ÚNICAMENTE estos IDs. Nunca inventes cityId ni attractionId.',
    ...lines,
    'Para ciudades no listadas, usa el formato {cityId}_0 a {cityId}_4.',
    '</catalog>',
    '',
    'IMPORTANTE: Toma cityId y attractionId exactamente del catálogo anterior. Las fechas van en dd/mm/yyyy y los horarios en HH:mm.',
  ].join('\n');
}

function buildCityIndexBlock(cityIndex?: CatalogEntry[]): string {
  if (!cityIndex || cityIndex.length === 0) {
    return 'No se recibió un índice de ciudades — usa kebab-case para cityId basado en el nombre en inglés de la ciudad (ej: "paris", "newyork").';
  }
  const lines = cityIndex.map(c => `  ${c.id} = ${c.name}`);
  return [
    '<city_index>',
    'Usa ÚNICAMENTE estos cityId al llenar "cityIds" en cada opción. Nunca inventes uno que no esté en esta lista.',
    ...lines,
    '</city_index>',
  ].join('\n');
}

function buildScheduleBlock(schedule?: { date: string; startTime: string; endTime: string }[]): string {
  if (!schedule || schedule.length === 0) {
    return 'El viajero no tiene otras atracciones con horario definido en esta parada.';
  }
  const lines = schedule.map(s => `  ${s.date}: ${s.startTime}–${s.endTime}`);
  return [
    'Horarios YA OCUPADOS por atracciones planificadas en esta parada — NINGUNA sugerencia puede superponerse ni colisionar con estos rangos, ni total ni parcialmente:',
    ...lines,
  ].join('\n');
}

function buildDepartureBlock(departures?: { date: string; time: string }[]): string {
  if (!departures || departures.length === 0) {
    return 'El viajero no tiene transporte reservado saliendo de esta ciudad todavía.';
  }
  const lines = departures.map(d => `  ${d.date} a las ${d.time}`);
  return [
    'El viajero ya tiene transporte reservado saliendo de esta ciudad en estos momentos. NINGUNA sugerencia puede coincidir con la hora de viaje ni ser posterior a ella: toda sugerencia (desde su startTime hasta su endTime) debe completarse ANTES de la hora de salida, en la misma fecha — el viajero ya no estará en la ciudad a partir de ese momento:',
    ...lines,
  ].join('\n');
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export class AiController {
  suggest = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { preferences, duration, budget, cityIndex } = req.body as AiSuggestBody;

      const prompts = loadPrompts();
      const systemPrompt = fillTemplate(prompts.suggest.system, { cityIndexBlock: buildCityIndexBlock(cityIndex) });

      const userMessage = fillTemplate(prompts.suggest.userTemplate, {
        preferences,
        duration: duration != null ? String(duration) : 'not specified',
        budget:   budget ?? 'not specified',
      });

      const completion = await deepseekClient.chat.completions.create({
        model: 'deepseek-v4-flash',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
      });

      const raw = completion.choices[0].message.content ?? '{}';
      req.result = JSON.parse(raw) as SuggestTripsResponse;
      next();
    } catch (err) { next(err); }
  };

  /**
   * Calls DeepSeek to generate a full itinerary plan. Pure — no Express req/res.
   * Extracted from the old Express-middleware `plan` method so the background
   * AI plan job (src/lib/ai-plan-job.ts) can call it directly; POST /ai/plan's
   * route chain no longer calls this as middleware (see kickoff-ai-plan.middleware.ts).
   */
  generatePlan = async (body: AiPlanBody): Promise<PlanTripResponse> => {
    const { selectedOption, preferences, duration, budget, startDate, cityCatalog } = body;

    const prompts = loadPrompts();
    const systemPrompt = fillTemplate(prompts.plan.system, { catalogBlock: buildCatalogBlock(cityCatalog) });

    const userMessage = fillTemplate(prompts.plan.userTemplate, {
      selectedOptionTitle:      selectedOption.title,
      selectedOptionSummary:    selectedOption.summary,
      selectedOptionHighlights: selectedOption.highlights.join(', '),
      preferences,
      duration:  duration != null ? String(duration) : 'not specified',
      budget:    budget ?? 'not specified',
      startDate: startDate ?? 'not specified',
    });

    const completion = await deepseekClient.chat.completions.create({
      model: 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
    });

    const raw = completion.choices[0].message.content ?? '{}';
    return JSON.parse(raw) as PlanTripResponse;
  };

  suggestCityAttractions = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cityId, checkIn, checkOut, existingAttractionIds, existingSchedule, departureTimes, cityCatalog } = req.body as AiSuggestAttractionsBody;

      const prompts = loadPrompts();
      const systemPrompt = fillTemplate(prompts.suggestAttractions.system, {
        catalogBlock: buildCatalogBlock({ [cityId]: cityCatalog }),
      });

      const userMessage = fillTemplate(prompts.suggestAttractions.userTemplate, {
        cityId,
        checkIn,
        checkOut,
        existingBlock: existingAttractionIds && existingAttractionIds.length > 0
          ? existingAttractionIds.join(', ')
          : 'ninguna',
        scheduleBlock: buildScheduleBlock(existingSchedule),
        departureBlock: buildDepartureBlock(departureTimes),
      });

      const completion = await deepseekClient.chat.completions.create({
        model: 'deepseek-v4-flash',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
      });

      const raw = completion.choices[0].message.content ?? '{}';
      const parsed = JSON.parse(raw) as SuggestCityAttractionsResponse;

      // Reinforce the prompt's "no collisions" instruction with a hard server-side filter —
      // the model can still slip, and this is the same collision/departure/catalog validation
      // suggestCompanion already applies to its own single suggestion, applied per-item here so
      // one bad suggestion doesn't cost the whole batch. See buildScheduleBlock/buildDepartureBlock.
      const validIds = new Set(cityCatalog.map(c => c.id));
      const suggestions = (parsed.suggestions ?? []).filter(s => {
        const inCatalog = validIds.has(s.attractionId);
        const collidesWithSchedule = (existingSchedule ?? []).some(
          e => e.date === s.date && rangesOverlap(s.startTime, s.endTime, e.startTime, e.endTime),
        );
        const pastDeparture = (departureTimes ?? []).some(
          d => d.date === s.date && s.endTime > d.time,
        );
        return inCatalog && !collidesWithSchedule && !pastDeparture;
      });

      req.result = { suggestions } as SuggestCityAttractionsResponse;
      next();
    } catch (err) { next(err); }
  };

  suggestCompanion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cityId, addedAttractionId, checkIn, checkOut, existingAttractionIds, existingSchedule, departureTimes, cityCatalog } = req.body as SuggestCompanionBody;

      const prompts = loadPrompts();
      const systemPrompt = fillTemplate(prompts.companionSuggest.system, {
        catalogBlock: buildCatalogBlock({ [cityId]: cityCatalog }),
      });

      const userMessage = fillTemplate(prompts.companionSuggest.userTemplate, {
        cityId,
        checkIn,
        checkOut,
        addedAttractionId,
        existingBlock: existingAttractionIds && existingAttractionIds.length > 0
          ? existingAttractionIds.join(', ')
          : 'ninguna',
        scheduleBlock: buildScheduleBlock(existingSchedule),
        departureBlock: buildDepartureBlock(departureTimes),
      });

      const completion = await deepseekClient.chat.completions.create({
        model: 'deepseek-v4-flash',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
      });

      const raw = completion.choices[0].message.content ?? '{}';
      const parsed = JSON.parse(raw) as CompanionSuggestion;

      const validIds = new Set(cityCatalog.map(c => c.id));
      const inCatalog = !!parsed.attractionId && validIds.has(parsed.attractionId);
      const collidesWithSchedule = (existingSchedule ?? []).some(
        s => s.date === parsed.date && rangesOverlap(parsed.startTime, parsed.endTime, s.startTime, s.endTime),
      );
      const pastDeparture = (departureTimes ?? []).some(
        d => d.date === parsed.date && parsed.endTime > d.time,
      );

      if (!inCatalog || collidesWithSchedule || pastDeparture) {
        res.status(204).send();
        return;
      }

      req.result = parsed;
      next();
    } catch (err) { next(err); }
  };
}
