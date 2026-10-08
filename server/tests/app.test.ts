import request from 'supertest';
import { createApp } from '../src/app';
import { demoStore } from '../src/data/demo-store';

const app = createApp(demoStore);

describe('read-only fitness API', () => {
  it('identifies demo mode in the health response', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', dataSource: 'demo' });
  });

  it('returns only public user fields', async () => {
    const response = await request(app).get('/api/users');
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);
    for (const user of response.body)
      expect(Object.keys(user).sort()).toEqual(['displayName', 'id']);
  });

  it('returns workouts with valid user references', async () => {
    const response = await request(app).get('/api/workouts');
    const users = await demoStore.getUsers();
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(6);
    for (const workout of response.body) {
      expect(users.some((user) => user.id === workout.userId)).toBe(true);
      expect(workout.durationMinutes).toBeGreaterThan(0);
    }
  });

  it('counts goal progress inside its date range', async () => {
    const response = await request(app).get('/api/goals');
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({ completedWorkouts: 3, targetWorkouts: 4 });
    expect(response.body[2]).toMatchObject({ completedWorkouts: 2, targetWorkouts: 3 });
  });

  it('ranks users by workouts and then active minutes', async () => {
    const response = await request(app).get('/api/rankings');
    expect(response.status).toBe(200);
    expect(
      response.body.map((entry: { rank: number; totalWorkouts: number; totalMinutes: number }) => [
        entry.rank,
        entry.totalWorkouts,
        entry.totalMinutes,
      ]),
    ).toEqual([
      [1, 3, 195],
      [2, 2, 95],
      [3, 1, 35],
    ]);
  });

  it('returns JSON for unknown routes and unimplemented writes', async () => {
    expect((await request(app).get('/api/missing')).status).toBe(404);
    const response = await request(app).post('/api/workouts').send({ name: 'New workout' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Route not found.' });
  });

  it('reports database errors without exposing internal details', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failingApp = createApp({
        ...demoStore,
        dataSource: 'postgres',
        getWorkouts: async () => {
          throw new Error('private database details');
        },
      });
      const response = await request(failingApp).get('/api/workouts');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Unable to complete the request.' });
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
