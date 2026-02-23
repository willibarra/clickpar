// Script para cargar datos de prueba en Supabase
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedDatabase() {
    console.log('🚀 Iniciando carga de datos...\n');

    // 1. PLATAFORMAS
    console.log('📺 Cargando plataformas...');
    const platforms = [
        { name: 'Netflix', slug: 'netflix', business_type: 'profile_sharing', icon_color: '#E50914', default_max_slots: 5, is_active: true },
        { name: 'Disney+', slug: 'disney-plus', business_type: 'profile_sharing', icon_color: '#0063e5', default_max_slots: 4, is_active: true },
        { name: 'HBO Max', slug: 'hbo-max', business_type: 'profile_sharing', icon_color: '#5c16c5', default_max_slots: 5, is_active: true },
        { name: 'Amazon Prime Video', slug: 'amazon-prime-video', business_type: 'profile_sharing', icon_color: '#00a8e1', default_max_slots: 6, is_active: true },
        { name: 'Apple TV+', slug: 'apple-tv-plus', business_type: 'profile_sharing', icon_color: '#000000', default_max_slots: 6, is_active: true },
        { name: 'Paramount+', slug: 'paramount-plus', business_type: 'profile_sharing', icon_color: '#0064FF', default_max_slots: 6, is_active: true },
        { name: 'Star+', slug: 'star-plus', business_type: 'profile_sharing', icon_color: '#C724B1', default_max_slots: 4, is_active: true },
        { name: 'Peacock', slug: 'peacock', business_type: 'profile_sharing', icon_color: '#000000', default_max_slots: 6, is_active: true },
        { name: 'Crunchyroll', slug: 'crunchyroll', business_type: 'profile_sharing', icon_color: '#F47521', default_max_slots: 4, is_active: true },
        { name: 'Funimation', slug: 'funimation', business_type: 'profile_sharing', icon_color: '#410099', default_max_slots: 4, is_active: true },
        { name: 'MUBI', slug: 'mubi', business_type: 'profile_sharing', icon_color: '#0066FF', default_max_slots: 1, is_active: true },
        { name: 'Curiosity Stream', slug: 'curiosity-stream', business_type: 'profile_sharing', icon_color: '#FF6B00', default_max_slots: 4, is_active: true },
        { name: 'Shudder', slug: 'shudder', business_type: 'profile_sharing', icon_color: '#C62828', default_max_slots: 5, is_active: true },
        { name: 'BritBox', slug: 'britbox', business_type: 'profile_sharing', icon_color: '#D4145A', default_max_slots: 4, is_active: true },
        { name: 'MGM+', slug: 'mgm-plus', business_type: 'profile_sharing', icon_color: '#FFD700', default_max_slots: 5, is_active: true },
        { name: 'Spotify', slug: 'spotify', business_type: 'family_account', icon_color: '#1DB954', default_max_slots: 6, is_active: true },
        { name: 'Apple Music', slug: 'apple-music', business_type: 'family_account', icon_color: '#FC3C44', default_max_slots: 6, is_active: true },
        { name: 'YouTube Music', slug: 'youtube-music', business_type: 'family_account', icon_color: '#FF0000', default_max_slots: 6, is_active: true },
        { name: 'Tidal', slug: 'tidal', business_type: 'family_account', icon_color: '#000000', default_max_slots: 6, is_active: true },
        { name: 'Deezer', slug: 'deezer', business_type: 'family_account', icon_color: '#FEAA2D', default_max_slots: 6, is_active: true },
        { name: 'Amazon Music', slug: 'amazon-music', business_type: 'family_account', icon_color: '#25D1DA', default_max_slots: 6, is_active: true },
        { name: 'Xbox Game Pass', slug: 'xbox-game-pass', business_type: 'family_account', icon_color: '#107C10', default_max_slots: 5, is_active: true },
        { name: 'PlayStation Plus', slug: 'playstation-plus', business_type: 'family_account', icon_color: '#003791', default_max_slots: 2, is_active: true },
        { name: 'Nintendo Online', slug: 'nintendo-online', business_type: 'family_account', icon_color: '#E60012', default_max_slots: 8, is_active: true },
        { name: 'EA Play', slug: 'ea-play', business_type: 'profile_sharing', icon_color: '#000000', default_max_slots: 1, is_active: true },
        { name: 'Microsoft 365', slug: 'microsoft-365', business_type: 'family_account', icon_color: '#0078D4', default_max_slots: 6, is_active: true },
        { name: 'Google One', slug: 'google-one', business_type: 'family_account', icon_color: '#4285F4', default_max_slots: 5, is_active: true },
        { name: 'Dropbox', slug: 'dropbox', business_type: 'family_account', icon_color: '#0061FF', default_max_slots: 6, is_active: true },
        { name: '1Password', slug: '1password', business_type: 'family_account', icon_color: '#0094F5', default_max_slots: 5, is_active: true },
        { name: 'NordVPN', slug: 'nordvpn', business_type: 'family_account', icon_color: '#4687FF', default_max_slots: 6, is_active: true },
    ];

    for (const p of platforms) {
        const { error } = await supabase.from('platforms').upsert(p, { onConflict: 'name' });
        if (error) console.log(`  ⚠️ ${p.name}: ${error.message}`);
    }
    console.log(`  ✅ ${platforms.length} plataformas cargadas\n`);

    // 2. CUENTAS MADRE (sin slot_price_gs ya que no existe en el schema)
    console.log('🔐 Cargando cuentas madre...');
    const accounts = [
        { platform: 'Netflix', email: 'netflix.cuenta1@gmail.com', password: 'Pass2024Nf!', max_slots: 5, renewal_date: '2026-02-15', purchase_cost_gs: 120000, status: 'active' },
        { platform: 'Netflix', email: 'netflix.cuenta2@gmail.com', password: 'SecureNf#22', max_slots: 5, renewal_date: '2026-02-20', purchase_cost_gs: 120000, status: 'active' },
        { platform: 'Netflix', email: 'netflix.premium3@gmail.com', password: 'NetPrem!99', max_slots: 5, renewal_date: '2026-03-01', purchase_cost_gs: 120000, status: 'active' },
        { platform: 'Disney+', email: 'disney.familia1@gmail.com', password: 'DisneyMag!c1', max_slots: 4, renewal_date: '2026-02-10', purchase_cost_gs: 80000, status: 'active' },
        { platform: 'Disney+', email: 'disney.plus2@gmail.com', password: 'DPlus2024#', max_slots: 4, renewal_date: '2026-02-25', purchase_cost_gs: 80000, status: 'active' },
        { platform: 'HBO Max', email: 'hbo.cuenta1@gmail.com', password: 'HboMax!2024', max_slots: 5, renewal_date: '2026-02-18', purchase_cost_gs: 100000, status: 'active' },
        { platform: 'HBO Max', email: 'hbomax.premium@gmail.com', password: 'Premium#Hbo', max_slots: 5, renewal_date: '2026-03-05', purchase_cost_gs: 100000, status: 'active' },
        { platform: 'Spotify', email: 'spotify.familia1@gmail.com', password: 'SpotFam!2024', max_slots: 6, renewal_date: '2026-02-12', purchase_cost_gs: 75000, status: 'active' },
        { platform: 'Spotify', email: 'spotify.familia2@gmail.com', password: 'FamSpot#99', max_slots: 6, renewal_date: '2026-02-28', purchase_cost_gs: 75000, status: 'active' },
        { platform: 'Spotify', email: 'spotify.premium3@gmail.com', password: 'SpotPrem!1', max_slots: 6, renewal_date: '2026-03-10', purchase_cost_gs: 75000, status: 'active' },
        { platform: 'YouTube Music', email: 'youtube.familia@gmail.com', password: 'YtMusic!24', max_slots: 6, renewal_date: '2026-02-22', purchase_cost_gs: 70000, status: 'active' },
        { platform: 'Amazon Prime Video', email: 'amazon.prime1@gmail.com', password: 'Prime2024!', max_slots: 6, renewal_date: '2026-03-15', purchase_cost_gs: 90000, status: 'active' },
        { platform: 'Crunchyroll', email: 'crunchy.anime@gmail.com', password: 'Anime!2024', max_slots: 4, renewal_date: '2026-02-08', purchase_cost_gs: 50000, status: 'active' },
        { platform: 'Xbox Game Pass', email: 'xbox.gamer@gmail.com', password: 'XboxGP!24', max_slots: 5, renewal_date: '2026-03-01', purchase_cost_gs: 120000, status: 'active' },
        { platform: 'Microsoft 365', email: 'office.familia@gmail.com', password: 'Office365!', max_slots: 6, renewal_date: '2026-04-01', purchase_cost_gs: 150000, status: 'active' },
        { platform: 'Apple Music', email: 'apple.familia@icloud.com', password: 'AppleM!24', max_slots: 6, renewal_date: '2026-02-14', purchase_cost_gs: 72000, status: 'active' },
        { platform: 'Paramount+', email: 'paramount.cuenta@gmail.com', password: 'Para2024!', max_slots: 6, renewal_date: '2026-02-20', purchase_cost_gs: 65000, status: 'active' },
        { platform: 'Star+', email: 'starplus.cuenta@gmail.com', password: 'Star!2024', max_slots: 4, renewal_date: '2026-02-28', purchase_cost_gs: 70000, status: 'active' },
        { platform: 'NordVPN', email: 'nordvpn.familia@gmail.com', password: 'Nord!VPN24', max_slots: 6, renewal_date: '2026-06-01', purchase_cost_gs: 200000, status: 'active' },
        { platform: 'Tidal', email: 'tidal.hifi@gmail.com', password: 'TidalHifi!', max_slots: 6, renewal_date: '2026-03-20', purchase_cost_gs: 85000, status: 'active' },
    ];

    const familyPlatforms = ['Spotify', 'Apple Music', 'YouTube Music', 'Tidal', 'Deezer', 'Amazon Music',
        'Xbox Game Pass', 'PlayStation Plus', 'Nintendo Online', 'Microsoft 365', 'Google One', 'Dropbox', '1Password', 'NordVPN'];

    let accountsCreated = 0;
    for (const acc of accounts) {
        // Check if already exists
        const { data: existing } = await supabase
            .from('mother_accounts')
            .select('id')
            .eq('email', acc.email)
            .single();

        if (existing) {
            console.log(`  ⏭️ ${acc.email}: ya existe`);
            continue;
        }

        // Insert account
        const { data: insertedAccount, error: accError } = await supabase
            .from('mother_accounts')
            .insert(acc)
            .select()
            .single();

        if (accError) {
            console.log(`  ⚠️ ${acc.email}: ${accError.message}`);
            continue;
        }

        accountsCreated++;

        // Create slots for account
        const slotPrefix = familyPlatforms.includes(acc.platform) ? 'Miembro' : 'Perfil';
        const slots = [];
        for (let i = 1; i <= acc.max_slots; i++) {
            let status = 'available';
            if (i === 1) status = 'sold'; // First slot always sold (admin)
            else if (Math.random() < 0.35) status = 'sold';
            else if (Math.random() < 0.1) status = 'reserved';

            slots.push({
                mother_account_id: insertedAccount.id,
                slot_identifier: `${slotPrefix} ${i}`,
                status,
                pin_code: Math.random() < 0.3 ? String(Math.floor(Math.random() * 10000)).padStart(4, '0') : null
            });
        }

        const { error: slotError } = await supabase.from('sale_slots').insert(slots);
        if (slotError) console.log(`  ⚠️ Slots ${acc.email}: ${slotError.message}`);
    }
    console.log(`  ✅ ${accountsCreated} cuentas nuevas con slots cargadas\n`);

    // 3. RESUMEN
    console.log('📊 RESUMEN FINAL:');
    const { count: platCount } = await supabase.from('platforms').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const { count: accCount } = await supabase.from('mother_accounts').select('*', { count: 'exact', head: true });
    const { count: slotCount } = await supabase.from('sale_slots').select('*', { count: 'exact', head: true });

    // Count by status
    const { data: slotStats } = await supabase.from('sale_slots').select('status');
    const available = slotStats?.filter(s => s.status === 'available').length || 0;
    const sold = slotStats?.filter(s => s.status === 'sold').length || 0;
    const reserved = slotStats?.filter(s => s.status === 'reserved').length || 0;

    console.log(`   📺 Plataformas: ${platCount}`);
    console.log(`   🔐 Cuentas Madre: ${accCount}`);
    console.log(`   🎫 Slots Total: ${slotCount}`);
    console.log(`      - Disponibles: ${available}`);
    console.log(`      - Vendidos: ${sold}`);
    console.log(`      - Reservados: ${reserved}`);
    console.log('\n✅ ¡Datos cargados exitosamente!');
    console.log('\n⚠️ NOTA: Las tablas "customers" y "sales" no existen en el schema actual.');
    console.log('   Para crear 50 clientes y 30 ventas, primero debo migrar el schema.');
}

seedDatabase().catch(console.error);
