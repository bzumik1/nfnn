import { InjectionToken, Type } from '@angular/core';

export type LoginDialogLoader = () => Promise<Type<unknown>>;

export const LOGIN_DIALOG_LOADER = new InjectionToken<LoginDialogLoader>('LOGIN_DIALOG_LOADER', {
  providedIn: 'root',
  factory: () => () =>
    import('./features/donors/login-dialog/login-dialog').then((loaded) => loaded.LoginDialog),
});
