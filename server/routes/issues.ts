import { Router } from 'express';
import { commentSchema, createIssueSchema, patchIssueSchema, resolutionSchema, retestSchema, transitionSchema } from '../../shared/schemas';
import { userOf } from '../middleware/currentUser';
import {
  addComment, addResolution, addRetest, createIssue, deleteIssue, editComment, getIssueDetail, patchIssue,
  searchIssues, transitionIssue,
} from '../services/issueService';
import { searchQuery } from './query';

export const issuesRouter = Router();

issuesRouter.get('/', (req, res) => {
  res.json(searchIssues(searchQuery(req)));
});

issuesRouter.post('/', async (req, res) => {
  const input = createIssueSchema.parse(req.body);
  res.status(201).json(await createIssue(input, userOf(req)));
});

issuesRouter.get('/:id', (req, res) => {
  res.json(getIssueDetail(req.params.id, req.user));
});

issuesRouter.patch('/:id', async (req, res) => {
  res.json(await patchIssue(req.params.id, patchIssueSchema.parse(req.body), userOf(req)));
});

issuesRouter.delete('/:id', async (req, res) => {
  await deleteIssue(req.params.id, userOf(req));
  res.status(204).end();
});

issuesRouter.post('/:id/transitions', async (req, res) => {
  res.json(await transitionIssue(req.params.id, transitionSchema.parse(req.body), userOf(req)));
});

issuesRouter.post('/:id/resolutions', async (req, res) => {
  res.json(await addResolution(req.params.id, resolutionSchema.parse(req.body), userOf(req)));
});

issuesRouter.post('/:id/retests', async (req, res) => {
  res.json(await addRetest(req.params.id, retestSchema.parse(req.body), userOf(req)));
});

issuesRouter.post('/:id/comments', async (req, res) => {
  const { body } = commentSchema.parse(req.body);
  res.status(201).json(await addComment(req.params.id, body, userOf(req)));
});

issuesRouter.patch('/:id/comments/:commentId', async (req, res) => {
  const { body } = commentSchema.parse(req.body);
  res.json(await editComment(req.params.id, req.params.commentId, body, userOf(req)));
});

issuesRouter.delete('/:id/comments/:commentId', async (req, res) => {
  res.json(await editComment(req.params.id, req.params.commentId, null, userOf(req)));
});
