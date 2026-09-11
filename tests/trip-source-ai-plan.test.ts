import { StubTripRepository } from './helpers/stubs';

describe('ITripRepository.create — sourceAiPlanRequestId', () => {
  it('accepts an optional sourceAiPlanRequestId without it appearing on the returned Trip', async () => {
    const trips = new StubTripRepository();
    const trip = await trips.create({
      title: 'Ruta Clásica', stops: [], transits: [], ownerId: 'u1',
      sourceAiPlanRequestId: 'req-1',
    });
    expect(trip.id).toBeDefined();
    expect((trip as any).sourceAiPlanRequestId).toBeUndefined();
  });

  it('works fine when sourceAiPlanRequestId is omitted (a normal, non-AI trip)', async () => {
    const trips = new StubTripRepository();
    const trip = await trips.create({ title: 'Manual Trip', stops: [], transits: [], ownerId: 'u1' });
    expect(trip.id).toBeDefined();
  });

  it('accepts an optional sourcePlanSessionId without it appearing on the returned Trip', async () => {
    const trips = new StubTripRepository();
    const trip = await trips.create({
      title: 'Ruta Clásica', stops: [], transits: [], ownerId: 'u1',
      sourcePlanSessionId: 'session-1',
    });
    expect(trip.id).toBeDefined();
    expect((trip as any).sourcePlanSessionId).toBeUndefined();
  });
});
