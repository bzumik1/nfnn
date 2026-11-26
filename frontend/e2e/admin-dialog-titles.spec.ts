import { expect, test } from './fixtures';
import { everyDialogTitle, SHARED_TITLE_CLASS, titleGroup } from './dialog-titles';

test.describe('Given every title of a dialog or a sheet of the administration in the templates', () => {
  test('when they are listed, then each one is the shared dialog title, so every dialog of the administration has one header', () => {
    const titles = everyDialogTitle().filter((title) =>
      title.template.startsWith('features/admin/'),
    );

    expect(titles.length).toBeGreaterThanOrEqual(12);
    expect(
      titles.filter((title) => title.titleClass !== SHARED_TITLE_CLASS).map(titleGroup),
    ).toEqual([]);
  });
});
