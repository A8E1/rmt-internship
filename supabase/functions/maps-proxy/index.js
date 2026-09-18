import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { createHandler } from './handler.js';

Deno.serve(createHandler({ createClient, env: name => Deno.env.get(name) }));
