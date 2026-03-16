-- ============================================
-- Custom Access Token Hook
-- Inyecta el rol del usuario (desde profiles) en el JWT
-- para evitar queries en cada request del middleware
-- ============================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
as $$
declare
  claims jsonb;
  profile_role public.user_role;
begin
  -- Obtener el rol del usuario desde profiles
  select role into profile_role
    from public.profiles
   where id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- Inyectar user_role en app_metadata
  if profile_role is not null then
    claims := jsonb_set(
      claims,
      '{app_metadata, user_role}',
      to_jsonb(profile_role::text)
    );
  else
    -- Fallback: si no hay perfil, asumir customer
    claims := jsonb_set(
      claims,
      '{app_metadata, user_role}',
      '"customer"'
    );
  end if;

  return jsonb_build_object('claims', claims);
end;
$$;

-- Permisos: supabase_auth_admin necesita ejecutar la función
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;

-- Revocar acceso público
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
