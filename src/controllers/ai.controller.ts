import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { deepseekClient } from '../lib/deepseek';
import { SuggestTripsResponse, PlanTripResponse, TripSuggestion, CityCatalog } from '../types';

interface PromptsFile {
  suggest: { system: string; userTemplate: string };
  plan:    { system: string; userTemplate: string };
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

export class AiController {
  suggest = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { preferences, duration, budget } = req.body as {
        preferences: string;
        duration?: number;
        budget?: string;
      };

      const prompts = loadPrompts();

      const userMessage = fillTemplate(prompts.suggest.userTemplate, {
        preferences,
        duration: duration != null ? String(duration) : 'not specified',
        budget:   budget ?? 'not specified',
      });

      const completion = await deepseekClient.chat.completions.create({
        model: 'deepseek-v4-flash',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompts.suggest.system },
          { role: 'user',   content: userMessage },
        ],
      });

      const raw = completion.choices[0].message.content ?? '{}';
      req.result = JSON.parse(raw) as SuggestTripsResponse;
      next();
    } catch (err) { next(err); }
  };

  plan = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { selectedOption, preferences, duration, budget, startDate, cityCatalog } = req.body as {
        selectedOption: TripSuggestion;
        preferences:    string;
        duration?:      number;
        budget?:        string;
        startDate?:     string;
        cityCatalog?:   CityCatalog;
      };

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
      req.result = JSON.parse(raw) as PlanTripResponse;
      next();
    } catch (err) { next(err); }
  };
}
