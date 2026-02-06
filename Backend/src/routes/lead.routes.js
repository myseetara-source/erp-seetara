/**
 * Lead Routes
 * 
 * API endpoints for Sales Engine (Leads)
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import * as leadController from '../controllers/lead.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/v1/leads - Get all leads with filters
router.get('/', leadController.getLeads);

// GET /api/v1/leads/counts - Get lead counts by status
router.get('/counts', leadController.getLeadCounts);

// GET /api/v1/leads/:id - Get single lead
router.get('/:id', leadController.getLeadById);

// POST /api/v1/leads - Create new lead
router.post('/', leadController.createLead);

// POST /api/v1/leads/convert - Convert lead to order
router.post('/convert', leadController.convertLead);

// PATCH /api/v1/leads/:id - Update lead
router.patch('/:id', leadController.updateLead);

// DELETE /api/v1/leads/:id - Cancel/Delete lead
router.delete('/:id', leadController.deleteLead);

export default router;
