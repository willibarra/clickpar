// Script para crear tablas de clientes y ventas, y cargar datos
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTablesAndSeed() {
    console.log('🚀 Creando tablas de Clientes y Ventas...\n');

    // 1. Crear tabla customers si no existe (usando SQL directo vía RPC)
    console.log('📋 Verificando/creando tabla customers...');

    // Intentamos insertar en customers, si falla la creamos
    const { error: checkCustomers } = await supabase.from('customers').select('id').limit(1);

    if (checkCustomers && checkCustomers.code === '42P01') {
        console.log('   ⚠️ Tabla customers no existe - La crearemos via REST...');
        // No podemos crear tablas via REST, necesitamos hacerlo manualmente
        console.log('   ❌ Necesitas ejecutar la migración SQL en Supabase Studio.');
        return;
    }

    // 2. Cargar clientes
    console.log('👥 Cargando 50 clientes...');
    const customers = [
        { full_name: 'Juan Carlos Pérez', phone: '+595981123456', email: 'juancarlos.perez@gmail.com', notes: 'Cliente frecuente' },
        { full_name: 'María Fernanda López', phone: '+595971234567', email: 'mariaf.lopez@hotmail.com' },
        { full_name: 'Roberto Gómez', phone: '+595982345678', email: 'roberto.gomez@gmail.com', notes: 'Prefiere WhatsApp' },
        { full_name: 'Ana Sofía Martínez', phone: '+595973456789', email: 'anasofia.m@gmail.com', notes: 'Estudiante' },
        { full_name: 'Carlos Eduardo Silva', phone: '+595984567890', email: 'carlos.silva@outlook.com' },
        { full_name: 'Patricia Rodríguez', phone: '+595975678901', email: 'patricia.rod@gmail.com', notes: 'Pago puntual' },
        { full_name: 'Diego Alejandro Ruiz', phone: '+595986789012', email: 'diego.ruiz@gmail.com' },
        { full_name: 'Valentina Torres', phone: '+595977890123', email: 'vale.torres@hotmail.com', notes: 'Referida por Juan' },
        { full_name: 'Santiago Morales', phone: '+595988901234', email: 'santi.morales@gmail.com' },
        { full_name: 'Camila Herrera', phone: '+595979012345', email: 'camila.h@gmail.com', notes: 'Pago anticipado' },
        { full_name: 'Andrés Felipe Castro', phone: '+595980123456', email: 'andres.castro@gmail.com' },
        { full_name: 'Luciana Vargas', phone: '+595971234568', email: 'luciana.v@outlook.com', notes: 'VIP' },
        { full_name: 'Matías González', phone: '+595982345679', email: 'matias.gon@gmail.com' },
        { full_name: 'Isabella Flores', phone: '+595973456780', email: 'isa.flores@gmail.com', notes: 'Grupo familiar' },
        { full_name: 'Sebastián Díaz', phone: '+595984567891', email: 'seba.diaz@hotmail.com' },
        { full_name: 'Antonella Ramírez', phone: '+595975678902', email: 'anto.ramirez@gmail.com', notes: 'Solo Netflix' },
        { full_name: 'Nicolás Jiménez', phone: '+595986789013', email: 'nico.jimenez@gmail.com' },
        { full_name: 'Martina Aguirre', phone: '+595977890124', email: 'martina.a@gmail.com', notes: 'Pago mensual' },
        { full_name: 'Joaquín Medina', phone: '+595988901235', email: 'joaco.medina@outlook.com' },
        { full_name: 'Renata Sánchez', phone: '+595979012346', email: 'renata.s@gmail.com', notes: 'Estudiante universitaria' },
        { full_name: 'Emiliano Núñez', phone: '+595980123457', email: 'emi.nunez@gmail.com' },
        { full_name: 'Victoria Romero', phone: '+595971234569', email: 'vicky.romero@gmail.com', notes: 'Referido premium' },
        { full_name: 'Tomás Acosta', phone: '+595982345680', email: 'tomas.acosta@hotmail.com' },
        { full_name: 'Sofía Méndez', phone: '+595973456781', email: 'sofia.mendez@gmail.com', notes: 'Combo streaming' },
        { full_name: 'Lucas Benítez', phone: '+595984567892', email: 'lucas.benitez@gmail.com' },
        { full_name: 'Abril Ortega', phone: '+595975678903', email: 'abril.ortega@outlook.com', notes: 'Solo música' },
        { full_name: 'Benjamín Cabrera', phone: '+595986789014', email: 'benja.cabrera@gmail.com' },
        { full_name: 'Mía Delgado', phone: '+595977890125', email: 'mia.delgado@gmail.com', notes: 'Gamer' },
        { full_name: 'Maximiliano Vera', phone: '+595988901236', email: 'maxi.vera@gmail.com' },
        { full_name: 'Olivia Fernández', phone: '+595979012347', email: 'olivia.f@hotmail.com', notes: 'Pack completo' },
        { full_name: 'Thiago Paz', phone: '+595980123458', email: 'thiago.paz@gmail.com' },
        { full_name: 'Catalina Ríos', phone: '+595971234570', email: 'cata.rios@gmail.com', notes: 'Familiar' },
        { full_name: 'Ian Paredes', phone: '+595982345681', email: 'ian.paredes@outlook.com' },
        { full_name: 'Emma Villalba', phone: '+595973456782', email: 'emma.villalba@gmail.com', notes: 'Pago semanal' },
        { full_name: 'Facundo Ledesma', phone: '+595984567893', email: 'facu.ledesma@gmail.com' },
        { full_name: 'Alma Peralta', phone: '+595975678904', email: 'alma.peralta@gmail.com', notes: 'Solo Disney' },
        { full_name: 'Bruno Quintana', phone: '+595986789015', email: 'bruno.q@hotmail.com' },
        { full_name: 'Nina Salazar', phone: '+595977890126', email: 'nina.salazar@gmail.com', notes: 'Combo familiar' },
        { full_name: 'Gael Figueroa', phone: '+595988901237', email: 'gael.figueroa@gmail.com' },
        { full_name: 'Luna Espinoza', phone: '+595979012348', email: 'luna.espinoza@outlook.com', notes: 'Referida' },
        { full_name: 'Dylan Maldonado', phone: '+595980123459', email: 'dylan.m@gmail.com' },
        { full_name: 'Zoe Guerrero', phone: '+595971234571', email: 'zoe.guerrero@gmail.com', notes: 'Pack gaming' },
        { full_name: 'Noah Mendoza', phone: '+595982345682', email: 'noah.mendoza@gmail.com' },
        { full_name: 'Bianca Ojeda', phone: '+595973456783', email: 'bianca.ojeda@hotmail.com', notes: 'Música premium' },
        { full_name: 'Dante Rivas', phone: '+595984567894', email: 'dante.rivas@gmail.com' },
        { full_name: 'Lara Sosa', phone: '+595975678905', email: 'lara.sosa@gmail.com', notes: 'VIP Gold' },
        { full_name: 'Elías Franco', phone: '+595986789016', email: 'elias.franco@outlook.com' },
        { full_name: 'Kiara Molina', phone: '+595977890127', email: 'kiara.molina@gmail.com', notes: 'Estudiante' },
        { full_name: 'Santino Vega', phone: '+595988901238', email: 'santino.vega@gmail.com' },
        { full_name: 'Jazmín Campos', phone: '+595979012349', email: 'jazmin.campos@gmail.com', notes: 'Cliente nuevo' },
    ];

    let customersInserted = 0;
    for (const c of customers) {
        const { error } = await supabase.from('customers').insert(c);
        if (error && error.code !== '23505') { // Ignore duplicate
            console.log(`   ⚠️ ${c.full_name}: ${error.message}`);
        } else if (!error) {
            customersInserted++;
        }
    }
    console.log(`   ✅ ${customersInserted} clientes nuevos cargados\n`);

    // 3. Cargar ventas
    console.log('💰 Cargando 30 ventas...');

    // Get sold slots
    const { data: soldSlots } = await supabase
        .from('sale_slots')
        .select('id, mother_account_id')
        .eq('status', 'sold')
        .limit(30);

    // Get customers
    const { data: allCustomers } = await supabase.from('customers').select('id');

    if (soldSlots && allCustomers && soldSlots.length > 0 && allCustomers.length > 0) {
        const paymentMethods = ['cash', 'transfer', 'qr', 'other'];
        let salesCreated = 0;

        for (let i = 0; i < Math.min(soldSlots.length, 30); i++) {
            const slot = soldSlots[i];
            const customer = allCustomers[i % allCustomers.length];

            const sale = {
                slot_id: slot.id,
                customer_id: customer.id,
                amount_gs: 25000 + (Math.floor(Math.random() * 4) * 5000), // 25000-40000
                payment_method: paymentMethods[i % 4],
                billing_cycle_day: (i % 28) + 1,
                start_date: `2026-01-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
            };

            const { error: saleError } = await supabase.from('sales').insert(sale);
            if (!saleError) {
                salesCreated++;
            } else if (saleError.code !== '23505') {
                console.log(`   ⚠️ Venta ${i + 1}: ${saleError.message}`);
            }
        }
        console.log(`   ✅ ${salesCreated} ventas creadas\n`);
    } else {
        console.log('   ⚠️ No hay slots vendidos o clientes disponibles\n');
    }

    // 4. RESUMEN
    console.log('📊 RESUMEN FINAL:');
    const { count: platCount } = await supabase.from('platforms').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const { count: accCount } = await supabase.from('mother_accounts').select('*', { count: 'exact', head: true });
    const { count: slotCount } = await supabase.from('sale_slots').select('*', { count: 'exact', head: true });
    const { count: custCount } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    const { count: saleCount } = await supabase.from('sales').select('*', { count: 'exact', head: true });

    console.log(`   📺 Plataformas: ${platCount}`);
    console.log(`   🔐 Cuentas Madre: ${accCount}`);
    console.log(`   🎫 Slots: ${slotCount}`);
    console.log(`   👥 Clientes: ${custCount}`);
    console.log(`   💰 Ventas: ${saleCount}`);
    console.log('\n✅ ¡Datos cargados exitosamente!');
}

createTablesAndSeed().catch(console.error);
