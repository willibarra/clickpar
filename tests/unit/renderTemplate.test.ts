import { describe, it, expect, vi } from 'vitest';

// renderTemplate is a pure function — unmock the module to test the real implementation
vi.unmock('@/lib/whatsapp');

// Import the real function (not the mock from setup.ts)
import { renderTemplate } from '@/lib/whatsapp';

describe('renderTemplate', () => {
  it('replaces simple variables', () => {
    const template = 'Hola {nombre}, tu servicio de {plataforma} está listo.';
    const result = renderTemplate(template, {
      nombre: 'Juan',
      plataforma: 'Netflix',
    });
    expect(result).toBe('Hola Juan, tu servicio de Netflix está listo.');
  });

  it('replaces multiple occurrences of the same variable', () => {
    const template = '{nombre} ya tiene acceso. Gracias {nombre}!';
    const result = renderTemplate(template, { nombre: 'María' });
    expect(result).toBe('María ya tiene acceso. Gracias María!');
  });

  it('removes lines containing empty variables', () => {
    const template = [
      '📧 Email: {email}',
      '🔑 Password: {password}',
      '🔒 PIN: {pin}',
      '📅 Vence: {fecha}',
    ].join('\n');

    const result = renderTemplate(template, {
      email: 'test@mail.com',
      password: 'abc123',
      pin: '', // empty → line should be removed
      fecha: '15/04/2026',
    });

    expect(result).toContain('Email: test@mail.com');
    expect(result).toContain('Password: abc123');
    expect(result).not.toContain('PIN');
    expect(result).toContain('Vence: 15/04/2026');
  });

  it('collapses consecutive blank lines into one', () => {
    const template = [
      'Línea 1',
      '',
      '',
      '',
      'Línea 2',
    ].join('\n');

    const result = renderTemplate(template, {});
    const lines = result.split('\n');

    // Should be: Línea 1, (single blank), Línea 2
    expect(lines).toEqual(['Línea 1', '', 'Línea 2']);
  });

  it('removes trailing whitespace', () => {
    const template = 'Hola {nombre}\n\n';
    const result = renderTemplate(template, { nombre: 'Test' });
    expect(result).toBe('Hola Test');
  });

  it('returns original text when template has no variables', () => {
    const template = 'Texto fijo sin variables';
    const result = renderTemplate(template, {});
    expect(result).toBe('Texto fijo sin variables');
  });

  it('handles real-world credential template', () => {
    const template = [
      '✅ *Tu acceso a {plataforma}*',
      '',
      '👤 Hola {nombre}!',
      '📧 *Correo:* {email}',
      '🔑 *Contraseña:* {password}',
      '👤 *Perfil:* {perfil}',
      '🔒 *PIN:* {pin}',
      '📅 *Vigencia:* {fecha_vencimiento}',
    ].join('\n');

    const result = renderTemplate(template, {
      plataforma: 'Disney+',
      nombre: 'Carlos',
      email: 'disney@test.com',
      password: 'pass123',
      perfil: 'Perfil 3',
      pin: '1234',
      fecha_vencimiento: '30/04/2026',
    });

    expect(result).toContain('✅ *Tu acceso a Disney+*');
    expect(result).toContain('Hola Carlos!');
    expect(result).toContain('*PIN:* 1234');
    expect(result).toContain('*Vigencia:* 30/04/2026');
  });

  it('handles real-world template with missing PIN', () => {
    const template = [
      '✅ *Tu acceso a {plataforma}*',
      '',
      '👤 Hola {nombre}!',
      '📧 *Correo:* {email}',
      '🔑 *Contraseña:* {password}',
      '🔒 *PIN:* {pin}',
      '📅 *Vigencia:* {fecha_vencimiento}',
    ].join('\n');

    const result = renderTemplate(template, {
      plataforma: 'HBO Max',
      nombre: 'Ana',
      email: 'hbo@test.com',
      password: 'hbo456',
      pin: '',
      fecha_vencimiento: '15/05/2026',
    });

    expect(result).not.toContain('PIN');
    expect(result).toContain('Contraseña:* hbo456');
  });
});
