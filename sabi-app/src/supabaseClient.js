import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://apjvrfycsvyzzxolxwmd.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwanZyZnljc3Z5enp4b2x4d21kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwOTczMDYsImV4cCI6MjEwMDY3MzMwNn0.1bU2uj4VsXNxCjRPDls4I1Mzoe4sGmYRono7SWB_9PE";

export const supabase = createClient(supabaseUrl, supabaseKey);