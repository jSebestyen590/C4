import { handle } from '@hono/aws-lambda';
import { createProductionApp } from './bootstrap';

export const handler = handle(createProductionApp());
