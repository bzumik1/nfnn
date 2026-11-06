export declare const APP_ROUTES_FILE: string;

export declare function appRoutePatterns(nginxConf: string): string[];

export declare function appRouteMatcher(nginxConf: string): (path: string) => boolean;
