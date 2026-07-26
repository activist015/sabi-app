import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "apjvrfycsvyzzxolxwmd.supabase.co";
const supabaseKey = "DYsImV4cCI6MjEwMDY3MzMwNn0.1bU2uj4VsXNxCjRPDls4I1Mzoe4sGmYRono7SWB_9PE";

export const supabase = createClient(supabaseUrl, supabaseKey);