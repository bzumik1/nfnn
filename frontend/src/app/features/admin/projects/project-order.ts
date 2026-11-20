import { ProjectOrder } from '../../content/projects-api';

export function projectOrderLabel(order: ProjectOrder): string {
  switch (order) {
    case 'YEAR_THEN_CATEGORY':
      return $localize`:@@admin.projects.order.yearThenCategory:Podle roku, v\u00a0něm podle kategorie`;
    case 'YEAR':
      return $localize`:@@admin.projects.order.year:Podle roku`;
    case 'CATEGORY_THEN_YEAR':
      return $localize`:@@admin.projects.order.categoryThenYear:Podle kategorie, v\u00a0ní podle roku`;
  }
}

export function projectOrderDescription(order: ProjectOrder): string {
  switch (order) {
    case 'YEAR_THEN_CATEGORY':
      return $localize`:@@admin.projects.order.yearThenCategory.description:Nahoře je nejnovější rok. V\u00a0každém roce jsou nejdřív příběhy dětí, pak dospělých, zvířat a\u00a0ostatních, a\u00a0v\u00a0každé kategorii od naposledy zveřejněného.`;
    case 'YEAR':
      return $localize`:@@admin.projects.order.year.description:Nahoře je nejnovější rok. V\u00a0každém roce jsou příběhy od naposledy zveřejněného, ať patří do kterékoli kategorie.`;
    case 'CATEGORY_THEN_YEAR':
      return $localize`:@@admin.projects.order.categoryThenYear.description:Nahoře jsou všechny příběhy dětí, pak dospělých, zvířat a\u00a0ostatních. V\u00a0každé kategorii od nejnovějšího roku a\u00a0v\u00a0roce od naposledy zveřejněného.`;
  }
}
