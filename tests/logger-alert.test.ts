jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }));
jest.mock('../src/lib/analytics', () => ({ capture: jest.fn() }));

import { capture } from '../src/lib/analytics';
import { logger } from '../src/lib/logger';

beforeEach(() => {
  (capture as jest.Mock).mockClear();
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => jest.restoreAllMocks());

describe('logger.error → server_error', () => {
  it('sends server_error with userId and the exact property set', () => {
    logger.error({ msg: 'boom', userId: 'u-1', flowId: 'f-1', method: 'GET', path: '/trips', status: 500, err: new Error('db down') });
    expect(capture).toHaveBeenCalledWith('u-1', 'server_error', {
      userId: 'u-1', msg: 'boom', error: 'db down', method: 'GET', path: '/trips', status: 500, flowId: 'f-1',
    });
  });

  it('uses anonymous and redacts emails when there is no user', () => {
    logger.error({ msg: 'Failed to generate/send OTP', email: 'a@b.com', err: 'rejected a@b.com' });
    const [id, , props] = (capture as jest.Mock).mock.calls[0];
    expect(id).toBe('anonymous');
    expect(props).toEqual({ userId: 'anonymous', msg: 'Failed to generate/send OTP', error: 'rejected [email]', method: null, path: null, status: null, flowId: null });
  });

  it('drops the query string from path', () => {
    logger.error({ msg: 'z', path: '/x?email=a@b.com' });
    expect((capture as jest.Mock).mock.calls[0][2].path).toBe('/x');
  });

  it('stringifies non-Error err and never throws', () => {
    expect(() => logger.error({ msg: 'x', err: { code: 1 } })).not.toThrow();
    expect(() => logger.error({ msg: 'y' })).not.toThrow();
    expect((capture as jest.Mock).mock.calls[0][2].error).toBe('[object Object]');
    expect((capture as jest.Mock).mock.calls[1][2].error).toBeNull();
  });

  it('alerts every distinct error in the same flow (background job)', () => {
    logger.error({ msg: 'AI plan generation failed', flowId: 'f-2' });
    logger.error({ msg: 'Failed to refund karma after AI plan failure', flowId: 'f-2' });
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('onlyIfFirstInFlow skips a flow that already alerted, but alerts a fresh one', () => {
    logger.error({ msg: 'real cause', flowId: 'f-3' });
    logger.error({ msg: '← response', flowId: 'f-3', status: 500 }, { onlyIfFirstInFlow: true });
    logger.error({ msg: '← response', flowId: 'f-4', status: 503 }, { onlyIfFirstInFlow: true });
    expect((capture as jest.Mock).mock.calls.map(c => c[2].flowId)).toEqual(['f-3', 'f-4']);
  });

  it('info and warn never send', () => {
    logger.info({ msg: 'a' }); logger.warn({ msg: 'b' });
    expect(capture).not.toHaveBeenCalled();
  });
});
