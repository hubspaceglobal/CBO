const SUPABASE_URL = 'https://qummleodrnuyudauxnpa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1bW1sZW9kcm51eXVkYXV4bnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODYzOTAsImV4cCI6MjA5MTI2MjM5MH0.nlnIYE4h3p-FtiKsIu2otnGdqUKOigUaBVSnx6zC-18';

async function insertRow(table, data) {
  const res = await fetch(`$${SUPABASE_URL}/rest/v1/$${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Insert failed on ${table}`);
  }
  return true;
}
