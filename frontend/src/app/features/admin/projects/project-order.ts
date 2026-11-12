import { ProjectOrder } from '../../content/projects-api';

export function projectOrderLabel(order: ProjectOrder): string {
  switch (order) {
    case 'YEAR_THEN_CATEGORY':
      return $localize`:@@admin.projects.order.yearThenCategory:Podle roku, v něm podle kategorie`;
    case 'YEAR':
      return $localize`:@@admin.projects.order.year:Podle roku`;
    case 'CATEGORY_THEN_YEAR':
      return $localize`:@@admin.projects.order.categoryThenYear:Podle kategorie, v ní podle roku`;
  }
}

export function projectOrderDescription(order: ProjectOrder): string {
  switch (order) {
    case 'YEAR_THEN_CATEGORY':
      return $localize`:@@admin.projects.order.yearThenCategory.description:Nahoře je nejnovější rok. V každém roce jsou nejdřív příběhy dětí, pak dospělých, zvířat a ostatních, a v každé kategorii od naposledy zveřejněného.`;
    case 'YEAR':
      return $localize`:@@admin.projects.order.year.description:Nahoře je nejnovější rok. V každém roce jsou příběhy od naposledy zveřejněného, ať patří do kterékoli kategorie.`;
    case 'CATEGORY_THEN_YEAR':
      return $localize`:@@admin.projects.order.categoryThenYear.description:Nahoře jsou všechny příběhy dětí, pak dospělých, zvířat a ostatních. V každé kategorii od nejnovějšího roku a v roce od naposledy zveřejněného.`;
  }
}
