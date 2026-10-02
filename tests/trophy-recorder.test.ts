import { TrophyRecorder } from '../src/lib/trophy-recorder';
import { StubTrophyRepository, StubNotificationRepository } from './helpers/stubs';

describe('TrophyRecorder', () => {
  let repo: StubTrophyRepository;
  let notifications: StubNotificationRepository;
  let recorder: TrophyRecorder;

  beforeEach(() => {
    repo = new StubTrophyRepository();
    notifications = new StubNotificationRepository();
    recorder = new TrophyRecorder(repo, notifications);
  });

  it('awards bronze on the first event and notifies once', async () => {
    const earned = await recorder.record('u1', 'ai_plans', 'req-1');
    expect(earned.map(e => e.tier)).toEqual(['bronze']);
    const n = await notifications.listByUser('u1');
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ type: 'trophy', title: '🏆 ¡Nuevo trofeo!', body: 'Mejor planeador con IA — Bronce', url: '/profile#trofeos' });
  });

  it('a duplicate ref counts once and awards nothing', async () => {
    await recorder.record('u1', 'comments', 'c1');
    expect(await recorder.record('u1', 'comments', 'c1')).toEqual([]);
    expect(repo.events).toHaveLength(1);
  });

  it('awards silver exactly when the threshold is crossed', async () => {
    for (let i = 1; i <= 4; i++) await recorder.record('u1', 'clones', `t${i}`);
    const fifth = await recorder.record('u1', 'clones', 't5');
    expect(fifth.map(e => e.tier)).toEqual(['silver']);
  });

  it('favorites count per plan (scope), not across plans', async () => {
    for (let i = 1; i <= 9; i++) await recorder.record('owner', 'favorites', `A:fan${i}`, 'A');
    expect(await recorder.record('owner', 'favorites', 'B:fan10', 'B')).toEqual([]);   // bronze already, B has 1
    const tenthOnA = await recorder.record('owner', 'favorites', 'A:fan10', 'A');
    expect(tenthOnA.map(e => e.tier)).toEqual(['silver']);
  });

  it('a muted user still earns the trophy but gets no notification', async () => {
    notifications.mutedUsers.add('u1');
    expect((await recorder.record('u1', 'share_plan', 's1')).map(e => e.tier)).toEqual(['single']);
    expect(await notifications.listByUser('u1')).toHaveLength(0);
  });

  it('never throws — repo errors return []', async () => {
    jest.spyOn(repo, 'addEvent').mockRejectedValue(new Error('db down'));
    await expect(recorder.record('u1', 'comments', 'c1')).resolves.toEqual([]);
  });

  it('a notification failure still returns the earned trophy', async () => {
    jest.spyOn(notifications, 'add').mockRejectedValue(new Error('boom'));
    expect((await recorder.record('u1', 'publish_plan', 't1')).map(e => e.tier)).toEqual(['single']);
  });

  it('has() reports ownership and never throws', async () => {
    expect(await recorder.has('u1', 'plan_visited')).toBe(false);
    await recorder.record('u1', 'plan_visited', 'v1');
    expect(await recorder.has('u1', 'plan_visited')).toBe(true);
    jest.spyOn(repo, 'hasTrophy').mockRejectedValue(new Error('x'));
    expect(await recorder.has('u1', 'plan_visited')).toBe(true);   // fail closed: skip extra writes
  });
});
