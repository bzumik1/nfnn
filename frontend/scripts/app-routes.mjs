import { fileURLToPath } from 'node:url';

export const APP_ROUTES_FILE = fileURLToPath(new URL('../nginx.conf', import.meta.url));

const BLOCK = /map \$uri \$app_page \{([^}]*)\}/;
const SEGMENT = String.raw`(?:[a-z0-9-]+|\[\^/\]\+)`;
const ROUTE_LINE = new RegExp(String.raw`^"~(\^(/|(?:/${SEGMENT})+)\$)"\s+/index\.html;$`);
const PARAMETER = '[^/]+';

function routeLines(nginxConf) {
  const block = BLOCK.exec(nginxConf);
  if (!block) {
    throw new Error('nginx.conf holds no block map $uri $app_page');
  }
  return block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && line !== 'default @unknown_page;')
    .map((line) => {
      const route = ROUTE_LINE.exec(line);
      if (!route) {
        throw new Error(`not one literal app route per line in map $app_page: ${line}`);
      }
      return { regex: route[1], path: route[2] };
    });
}

export function appRoutePatterns(nginxConf) {
  return routeLines(nginxConf)
    .map(({ path }) => path.split(PARAMETER).join(':param'))
    .sort();
}

export function appRouteMatcher(nginxConf) {
  const routes = routeLines(nginxConf).map(({ regex }) => new RegExp(regex));
  return (path) => routes.some((route) => route.test(path));
}
