insert into content_media (id, width, height, uploaded_at)
values ('0190a000-0000-7000-8000-000000000001', 1600, 900, '2026-01-10T10:00:00Z');
insert into content_media_variant (id, media_id, width, height, data)
values ('0190a000-0000-7000-8000-000000000002', '0190a000-0000-7000-8000-000000000001', 800, 450, '\x52494646');
insert into content_news (id, slug, title, tag, perex, body, cover_media_id, published_on, created_at, updated_at)
values ('0190a000-0000-7000-8000-000000000003', 'letni-tabor', 'Letní tábor', 'Akce', 'Perex', 'Text aktuality',
        '0190a000-0000-7000-8000-000000000001', '2026-01-11', '2026-01-10T10:00:00Z', '2026-01-10T10:00:00Z');
insert into content_project (id, slug, title, year, tag, perex, body, cover_media_id, published_on, created_at, updated_at)
values ('0190a000-0000-7000-8000-000000000004', 'nova-strecha', 'Nová střecha', 2025, 'Stavba', 'Perex', 'Text projektu',
        '0190a000-0000-7000-8000-000000000001', '2026-01-12', '2026-01-10T10:00:00Z', '2026-01-10T10:00:00Z');

insert into donor (id, type, name, company_identifier, street, city, postal_code, email, password_hash, variable_symbol,
                   preferred_locale, registered_at, email_verified_at, erased_at)
values ('0190a000-0000-7000-8000-000000000010', 'PERSON', 'Testovací Dárce', null, 'Ulice 1', 'Město', '110 00',
        'darce@example.cz', '$2a$12$abcdefghijklmnopqrstuuSq0kE0Wn0vNnU5o9bqv1x6r0b8eQm2C', '1000000001', 'cs',
        '2026-01-01T09:00:00Z', '2026-01-01T09:05:00Z', null);
insert into donor_role (donor_id, role) values ('0190a000-0000-7000-8000-000000000010', 'ADMIN');
insert into donor_refresh_token (id, donor_id, secret_hash, issued_at, expires_at, revoked_at, second_factor_verified,
                                 client_id, scope, granted_at, used_at)
values ('0190a000-0000-7000-8000-000000000011', '0190a000-0000-7000-8000-000000000010', repeat('a', 64),
        '2026-01-02T09:00:00Z', '2026-01-16T09:00:00Z', null, true, null, null, '2026-01-02T09:00:00Z', null);
insert into donor_password_reset_token (id, donor_id, secret_hash, issued_at, expires_at, used_at)
values ('0190a000-0000-7000-8000-000000000012', '0190a000-0000-7000-8000-000000000010', repeat('b', 64),
        '2026-01-02T09:00:00Z', '2026-01-02T10:00:00Z', '2026-01-02T09:10:00Z');
insert into donor_email_verification_token (id, donor_id, secret_hash, issued_at, expires_at, used_at, new_email)
values ('0190a000-0000-7000-8000-000000000013', '0190a000-0000-7000-8000-000000000010', repeat('c', 64),
        '2026-01-01T09:00:00Z', '2026-01-02T09:00:00Z', '2026-01-01T09:05:00Z', null);
insert into donor_second_factor (donor_id, secret, created_at, confirmed_at, last_used_step)
values ('0190a000-0000-7000-8000-000000000010', 'JBSWY3DPEHPK3PXP', '2026-01-03T09:00:00Z', '2026-01-03T09:01:00Z', 59000000);
insert into donor_second_factor_challenge (id, donor_id, secret_hash, issued_at, expires_at, failed_attempts, used_at)
values ('0190a000-0000-7000-8000-000000000014', '0190a000-0000-7000-8000-000000000010', repeat('d', 64),
        '2026-01-04T09:00:00Z', '2026-01-04T09:05:00Z', 1, '2026-01-04T09:01:00Z');
insert into donor_passkey (id, donor_id, credential_id, credential_data, sign_count, transports, name, created_at, last_used_at)
values ('0190a000-0000-7000-8000-000000000015', '0190a000-0000-7000-8000-000000000010', 'Y3JlZGVudGlhbA', '\x00',
        3, 'internal', 'Telefon', '2026-01-05T09:00:00Z', null);
insert into donor_passkey_challenge (id, ceremony, donor_id, challenge_hash, issued_at, expires_at, used_at)
values ('0190a000-0000-7000-8000-000000000016', 'SIGN_IN', null, repeat('e', 64),
        '2026-01-05T09:00:00Z', '2026-01-05T09:05:00Z', null);
insert into oauth_authorization_code (id, secret_hash, donor_id, client_id, redirect_uri, code_challenge, scope, resource,
                                      second_factor_verified, issued_at, expires_at, used_at)
values ('0190a000-0000-7000-8000-000000000017', repeat('f', 64), '0190a000-0000-7000-8000-000000000010',
        'https://client.example/metadata.json', 'https://client.example/callback', repeat('g', 43), 'admin:read',
        'https://nfnn.cz/mcp', true, '2026-01-06T09:00:00Z', '2026-01-06T09:05:00Z', null);
insert into donor_registration_reminder (donor_id, sent_at)
values ('0190a000-0000-7000-8000-000000000010', '2026-01-02T09:00:00Z');

insert into donor_record (donor_id, type, name, company_identifier, street, city, postal_code, variable_symbol,
                          preferred_locale, registered_at, updated_at, erased_at)
values ('0190a000-0000-7000-8000-000000000010', 'PERSON', 'Testovací Dárce', null, 'Ulice 1', 'Město', '110 00',
        '1000000001', 'cs', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', null);
insert into bank_payment (id, bank_transaction_id, booked_on, amount_minor, currency, sender_account_number, sender_bank_code,
                          counterparty_account, counterparty_bank_code, counterparty_name, variable_symbol,
                          matching_variable_symbol, constant_symbol, specific_symbol, message_for_recipient,
                          transaction_type, imported_at, unpaired_by_admin_at)
values ('0190a000-0000-7000-8000-000000000020', 26000000001, '2026-01-07', 50000, 'CZK', '123456789', '0100',
        '123456789', '0100', 'Testovací Dárce', '1000000001', '1000000001', null, null, 'DAR', 'Bezhotovostní příjem',
        '2026-01-07T10:00:00Z', null);
insert into donor_sender_account (id, donor_id, account_number, bank_code, learned_from_payment_id, learned_at, status,
                                  valid_from, valid_to, created_at, disconnected_at)
values ('0190a000-0000-7000-8000-000000000021', '0190a000-0000-7000-8000-000000000010', '123456789', '0100',
        '0190a000-0000-7000-8000-000000000020', '2026-01-07T10:00:00Z', 'ACTIVE', '2026-01-07', null,
        '2026-01-07T10:00:00Z', null);
insert into donor_symbol_claim (id, donor_id, account_number, bank_code, variable_symbol, answer, answered_at)
values ('0190a000-0000-7000-8000-000000000022', '0190a000-0000-7000-8000-000000000010', '123456789', '0100', '777',
        'CONFIRMED', '2026-01-08T10:00:00Z');
insert into donation (id, donor_id, bank_payment_id, received_on, amount_minor, currency, source, status, paired_by,
                      recorded_at, sender_account_id, purpose, symbol_claim_id)
values ('0190a000-0000-7000-8000-000000000023', '0190a000-0000-7000-8000-000000000010',
        '0190a000-0000-7000-8000-000000000020', '2026-01-07', 50000, 'CZK', 'BANK_TRANSFER', 'RECEIVED',
        'VARIABLE_SYMBOL', '2026-01-07T10:00:00Z', null, 'GENERAL', null);
insert into receipt_image (sha256, media_type, content, first_used_at)
values (repeat('2', 64), 'image/png', '\x89504e47', '2026-01-09T10:00:00Z');
insert into donation_receipt_signature (id, image_sha256, width, height, uploaded_at)
values (1, repeat('2', 64), 600, 200, '2026-01-09T10:00:00Z');
insert into receipt_signing_key (key_id, public_key, registered_at, status, seal)
values ('0a1b2c3d', decode(repeat('ab', 32), 'hex'), '2026-01-09T10:00:00Z', 'active', 'seal');
insert into receipt_signing_key_adoption (restore_id, adopted_at) values ('restore-1', '2026-01-09T10:00:00Z');
insert into issued_receipt (id, donor_id, kind, donation_id, receipt_year, number, issued_on, issued_at, locale, fingerprint,
                            status, schema_version, frozen, signature_image_sha256, signing_key_id, proof, status_sha256,
                            supersedes_id, superseded_at)
values ('0190a000-0000-7000-8000-000000000026', '0190a000-0000-7000-8000-000000000010', 'SINGLE',
        '0190a000-0000-7000-8000-000000000023', null, '2026-000001', '2026-01-09', '2026-01-09T10:00:00Z', 'cs',
        repeat('5', 64), 'REPLACED', 1, '{}', repeat('2', 64), '0a1b2c3d', decode(repeat('cd', 65), 'hex'), repeat('6', 64),
        null, '2026-01-09T11:00:00Z'),
       ('0190a000-0000-7000-8000-000000000027', '0190a000-0000-7000-8000-000000000010', 'SINGLE',
        '0190a000-0000-7000-8000-000000000023', null, '2026-000002', '2026-01-09', '2026-01-09T11:00:00Z', 'cs',
        repeat('7', 64), 'ACTIVE', 1, '{}', null, '0a1b2c3d', decode(repeat('ef', 65), 'hex'), repeat('8', 64),
        '0190a000-0000-7000-8000-000000000026', null);
insert into donation_monthly_report (report_month, sent_at) values ('2026-01-01', '2026-02-01T06:00:00Z');
insert into donation_report_settings (id, recipients, send_day, include_donors, include_donations,
                                      include_unpaired_payments, include_bank_import, updated_at)
values (1, 'info@example.cz', 1, true, true, true, true, '2026-01-09T10:00:00Z');
insert into bank_import_state (id, covered_from, covered_to, last_attempted_at, last_succeeded_at, last_failure_kind,
                               last_failure_message, updated_at, consecutive_failures, reported_outage)
values (1, '2025-10-10', '2026-01-09', '2026-01-09T10:00:00Z', '2026-01-09T10:00:00Z', null, null,
        '2026-01-09T10:00:00Z', 0, null);
insert into donation_import_alert (id, kind, failure_kind, failures, last_succeeded_at, occurred_at, created_at, outcome,
                                   settled_at)
values ('0190a000-0000-7000-8000-000000000025', 'OUTAGE', 'UNAVAILABLE', 3, '2026-01-08T10:00:00Z',
        '2026-01-09T09:00:00Z', '2026-01-09T09:00:00Z', 'SENT', '2026-01-09T09:01:00Z');

insert into contact_message (id, sender_name, sender_email, body, received_at)
values ('0190a000-0000-7000-8000-000000000030', 'Odesílatel', 'odesilatel@example.cz', 'Zpráva', '2026-01-09T10:00:00Z');

insert into backup_alert_state (id, reported_problems, reported_at) values (1, null, null);
insert into operations_setting (name, value, sealed, updated_at)
values ('PUBLIC_URL', 'https://nfnn.cz', false, '2026-01-09T10:00:00Z');
insert into operations_setup (id, completed_at) values (1, '2026-01-09T10:00:00Z');
insert into operations_restore_record (request_id, recorded_at) values ('restore-1', '2026-01-09T10:00:00Z');

insert into admin_action (id, admin_id, action, subject_id, details, performed_at, client)
values ('0190a000-0000-7000-8000-000000000040', '0190a000-0000-7000-8000-000000000010', 'REQUEST_BACKUP', null, '',
        '2026-01-09T10:00:00Z', null);
