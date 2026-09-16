const express = require('express');
const { readDb, updateDb } = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendSuccess, sendError, asyncRoute } = require('../lib/response');
const { scopeList } = require('../lib/scoping');
const { paginate } = require('../lib/paginate');
const { v4: uuidv4 } = require('uuid');

function createCellsRouter() {
  const router = express.Router();

  router.get('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const cells = await readDb('cells.json');
    const scoped = await scopeList(req, cells);
    const result = await paginate({
      req, data: scoped,
      search: (c, q) => (c.name || '').toLowerCase().includes(q),
      defaultSort: 'name',
    });
    sendSuccess(res, result);
  }));

  router.get('/all', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const cells = await readDb('cells.json');
    const scoped = await scopeList(req, cells);
    sendSuccess(res, { items: scoped });
  }));

  router.post('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return sendError(res, 'VALIDATION', 'Name is required', 400);
    const cellId = `CELL-${uuidv4().slice(0, 8).toUpperCase()}`;
    const cell = { cellId, name: name.trim(), createdAt: new Date().toISOString() };
    await updateDb('cells.json', (docs) => {
      docs.push(cell);
      return { data: docs, result: null };
    });
    sendSuccess(res, cell, 201);
  }));

  router.delete('/:cellId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { cellId } = req.params;
    await updateDb('cells.json', (docs) => {
      return { data: docs.filter(c => c.cellId !== cellId), result: null };
    });
    sendSuccess(res, { deleted: true });
  }));

  return router;
}

function createBlocksRouter() {
  const router = express.Router();

  router.get('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const blocks = await readDb('blocks.json');
    const scoped = await scopeList(req, blocks);
    const result = await paginate({
      req, data: scoped,
      search: (b, q) => (b.name || '').toLowerCase().includes(q),
      defaultSort: 'name',
    });
    sendSuccess(res, result);
  }));

  router.get('/all', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const blocks = await readDb('blocks.json');
    const scoped = await scopeList(req, blocks);
    sendSuccess(res, { items: scoped });
  }));

  router.post('/', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return sendError(res, 'VALIDATION', 'Name is required', 400);
    const blockId = `BLOCK-${uuidv4().slice(0, 8).toUpperCase()}`;
    const block = { blockId, name: name.trim(), createdAt: new Date().toISOString() };
    await updateDb('blocks.json', (docs) => {
      docs.push(block);
      return { data: docs, result: null };
    });
    sendSuccess(res, block, 201);
  }));

  router.delete('/:blockId', requireAuth, requireRole('admin', 'warden', 'super-admin', 'super_admin'), asyncRoute(async (req, res) => {
    const { blockId } = req.params;
    await updateDb('blocks.json', (docs) => {
      return { data: docs.filter(b => b.blockId !== blockId), result: null };
    });
    sendSuccess(res, { deleted: true });
  }));

  return router;
}

module.exports = { createCellsRouter, createBlocksRouter };
