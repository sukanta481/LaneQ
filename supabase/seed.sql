-- Demo data for local development: one salon, four lanes, six services, one
-- staff user. Safe to re-run.

do $$
declare
  v_salon uuid := '11111111-1111-1111-1111-111111111111';
  v_auth  uuid := '22222222-2222-2222-2222-222222222222';
  v_email text := 'owner@demo.test';
  v_pass  text := 'password123';
begin
  insert into salons (id, name, slug, timezone, terminology, branding, n8n_webhook_url)
  values (
    v_salon, 'Demo Salon', 'demo-salon', 'Asia/Kolkata',
    '{
      "lane_singular": "Chair",
      "lane_plural": "Chairs",
      "operator_singular": "Stylist",
      "service_singular": "Service",
      "customer_singular": "Customer"
    }'::jsonb,
    '{"primary_color": "#0f766e"}'::jsonb,
    null
  )
  on conflict (id) do nothing;

  -- Local auth user so /login works straight after a db reset. On a hosted
  -- project create the user through the dashboard instead and only keep the
  -- staff_users row below.
  if not exists (select 1 from auth.users where id = v_auth) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    values (
      '00000000-0000-0000-0000-000000000000', v_auth, 'authenticated', 'authenticated',
      v_email, crypt(v_pass, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(), v_auth,
      jsonb_build_object('sub', v_auth::text, 'email', v_email, 'email_verified', true),
      'email', v_auth::text, now(), now(), now()
    );
  end if;

  insert into staff_users (salon_id, auth_user_id, name, role)
  values (v_salon, v_auth, 'Demo Owner', 'owner')
  on conflict (auth_user_id) do nothing;

  insert into lanes (salon_id, name, sort_order, is_active) values
    (v_salon, 'Rahul',   1, true),
    (v_salon, 'Priya',   2, true),
    (v_salon, 'Chair 3', 3, true),
    (v_salon, 'Chair 4', 4, true)
  on conflict do nothing;

  insert into services (salon_id, name, default_duration_min, is_active) values
    (v_salon, 'Haircut',        25, true),
    (v_salon, 'Beard',          15, true),
    (v_salon, 'Hair Colour',    90, true),
    (v_salon, 'Facial',         45, true),
    (v_salon, 'Hair Spa',       40, true),
    (v_salon, 'Global Colour', 150, true)
  on conflict do nothing;
end
$$;
