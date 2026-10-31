import { ProjectCategory } from './projects-api';

export function projectCategoryLabel(category: ProjectCategory): string {
  switch (category) {
    case 'CHILDREN':
      return $localize`:@@content.project.category.children:Děti`;
    case 'ADULTS':
      return $localize`:@@content.project.category.adults:Dospělí`;
    case 'ANIMALS':
      return $localize`:@@content.project.category.animals:Zvířata`;
    case 'OTHER':
      return $localize`:@@content.project.category.other:Ostatní`;
  }
}
