interface PasswordCredentialData {
  id: string;
  password: string;
  name: string;
}

type PasswordCredentialConstructor = new (data: PasswordCredentialData) => Credential;

const OFF_SCREEN = '-10000px';

function passwordCredential(): PasswordCredentialConstructor | undefined {
  return (globalThis as { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential;
}

function input(document: Document, type: string, autocomplete: string, value: string) {
  const field = document.createElement('input');
  field.type = type;
  field.autocomplete = autocomplete as AutoFill;
  field.value = value;
  return field;
}

function submitOffScreenForm(document: Document, username: string, password: string): void {
  const form = document.createElement('form');
  form.style.position = 'fixed';
  form.style.top = OFF_SCREEN;
  form.style.left = OFF_SCREEN;
  form.setAttribute('aria-hidden', 'true');
  form.append(
    input(document, 'text', 'username', username),
    input(document, 'password', 'new-password', password),
  );
  form.addEventListener('submit', (event) => event.preventDefault());
  document.body.append(form);
  try {
    form.requestSubmit();
  } finally {
    form.remove();
  }
}

export async function offerToPasswordManager(
  document: Document,
  username: string,
  password: string,
): Promise<void> {
  const Credential = passwordCredential();
  if (Credential !== undefined && navigator.credentials?.store !== undefined) {
    await navigator.credentials.store(new Credential({ id: username, password, name: username }));
    return;
  }
  submitOffScreenForm(document, username, password);
}
