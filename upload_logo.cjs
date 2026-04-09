const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './boletim-app/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function upload() {
    const base64 = fs.readFileSync('Logo_Alpha.png', { encoding: 'base64' });
    const fullBase64 = `data:image/png;base64,${base64}`;

    const { data, error } = await supabase
        .from('configuracoes_sistema')
        .upsert({ chave: 'logo_base64', valor: fullBase64 }, { onConflict: 'chave' });
    
    if (error) console.error("Error:", error);
    else console.log("Success! Logo updated.");
}

upload();
