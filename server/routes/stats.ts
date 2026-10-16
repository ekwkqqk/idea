import { Router } from 'express';
import { getStats } from '../services/statsService';
import { searchQuery } from './query';

export const statsRouter = Router();

statsRouter.get('/', (req, res) => {
  const { testType, testRound, foundFrom, foundTo } = searchQuery(req);
  res.json(getStats({ testType, testRound, foundFrom, foundTo }));
});
