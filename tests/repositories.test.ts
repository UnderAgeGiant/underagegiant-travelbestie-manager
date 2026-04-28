import { MemoryUserRepository } from '../src/repositories/memory/memory-user.repository';
import { MemoryTripRepository } from '../src/repositories/memory/memory-trip.repository';
import { MemoryCommentRepository } from '../src/repositories/memory/memory-comment.repository';
import { MemoryKarmaRepository } from '../src/repositories/memory/memory-karma.repository';

describe('MemoryUserRepository', () => {
  let repo: MemoryUserRepository;
  beforeEach(() => { repo = new MemoryUserRepository(); });

  it('creates and retrieves a user by email', async () => {
    const user = await repo.create({ name: 'Ana', email: 'ana@test.com', passwordHash: 'h' });
    expect(user.id).toBeDefined();
    expect(await repo.findByEmail('ana@test.com')).toEqual(user);
  });

  it('returns null for unknown email', async () => {
    expect(await repo.findByEmail('nobody@test.com')).toBeNull();
  });

  it('returns null for unknown id', async () => {
    expect(await repo.findById('bad')).toBeNull();
  });
});

describe('MemoryTripRepository', () => {
  let repo: MemoryTripRepository;
  beforeEach(() => { repo = new MemoryTripRepository(); });

  it('creates a trip with stops and transits', async () => {
    const trip = await repo.create({
      title: 'Europe',
      stops: [{ cityId: 'paris', checkIn: '01/06/2026', checkOut: '05/06/2026', selectedAttractions: [] }],
      transits: [{ fromCityId: '__start__', toCityId: '__start__', segments: [{ mode: 'flight', departureDate: '01/06/2026', departureTime: '07:00', arrivalDate: '01/06/2026', arrivalTime: '09:30', notes: 'LA 706' }] }],
      ownerId: 'u1',
    });
    expect(trip.id).toBeDefined();
    expect(trip.stops).toHaveLength(1);
    expect(trip.transits).toHaveLength(1);
    expect(await repo.findByOwner('u1')).toHaveLength(1);
  });

  it('updates title and transits', async () => {
    const trip = await repo.create({ title: 'Asia', stops: [], transits: [], ownerId: 'u1' });
    const updated = await repo.update(trip.id, { title: 'Asia 2026', transits: [] });
    expect(updated?.title).toBe('Asia 2026');
  });

  it('returns null when updating non-existent trip', async () => {
    expect(await repo.update('bad-id', { title: 'x' })).toBeNull();
  });

  it('deletes a trip and returns true', async () => {
    const trip = await repo.create({ title: 'Del', stops: [], transits: [], ownerId: 'u1' });
    expect(await repo.delete(trip.id)).toBe(true);
    expect(await repo.findByOwner('u1')).toHaveLength(0);
  });

  it('returns false when deleting non-existent trip', async () => {
    expect(await repo.delete('bad-id')).toBe(false);
  });
});

describe('MemoryCommentRepository', () => {
  let repo: MemoryCommentRepository;
  beforeEach(() => { repo = new MemoryCommentRepository(); });

  it('adds and retrieves comments for an attraction', async () => {
    await repo.add({ attractionId: 'paris_0', name: 'Lia', text: 'Great!', rating: 5, color: '#fff', date: 'Apr 24' });
    const comments = await repo.findByAttraction('paris_0');
    expect(comments).toHaveLength(1);
    expect(comments[0].name).toBe('Lia');
  });

  it('returns empty array for attraction with no comments', async () => {
    expect(await repo.findByAttraction('unknown_0')).toEqual([]);
  });

  it('tracks whether a user has commented on an attraction', async () => {
    expect(await repo.hasCommented('ana@test.com', 'paris_0')).toBe(false);
    await repo.add({ attractionId: 'paris_0', name: 'Ana', text: 'Amazing!', rating: 5, color: '#fff', date: 'Apr 24', authorEmail: 'ana@test.com' } as any);
    expect(await repo.hasCommented('ana@test.com', 'paris_0')).toBe(true);
  });
});

describe('MemoryKarmaRepository', () => {
  let repo: MemoryKarmaRepository;
  beforeEach(() => { repo = new MemoryKarmaRepository(); });

  it('returns 0 for a user with no karma record', async () => {
    expect((await repo.get('new@test.com')).score).toBe(0);
  });

  it('applies positive delta', async () => {
    await repo.apply('u@test.com', +1);
    expect((await repo.get('u@test.com')).score).toBe(1);
  });

  it('applies negative delta', async () => {
    await repo.apply('u@test.com', +3);
    await repo.apply('u@test.com', -1);
    expect((await repo.get('u@test.com')).score).toBe(2);
  });
});
