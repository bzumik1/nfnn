import { expect, test } from './fixtures';

const CROSS_ORIGIN_WORKER = 'https://evil.example/worker-F2S2AQ7E.js';

test.describe('Given the site served with the security headers of the frontend nginx', () => {
  test('when the home page loads, then its policy requires Trusted Types and names the sources of workers and the manifest', async ({
    page,
  }) => {
    const answer = await page.goto('/');
    const policy = answer?.headers()['content-security-policy'] ?? '';

    expect(policy).toContain("require-trusted-types-for 'script'");
    expect(policy).toContain('trusted-types default angular');
    expect(policy).toContain("worker-src 'self'");
    expect(policy).toContain("manifest-src 'self'");
  });

  test('when the home page loads, then it keeps its window to itself, so a page of another site that opened it holds no handle on it', async ({
    page,
  }) => {
    const answer = await page.goto('/');

    expect(answer?.headers()['cross-origin-opener-policy']).toBe('same-origin');
  });

  test('when a script on the page writes a text into a script address, then the browser refuses it and the violation is recorded', async ({
    page,
    cspViolations,
  }) => {
    await page.goto('/');

    const refusal = await page.evaluate(() => {
      try {
        document.createElement('script').src = '/main.js';
        return 'admitted';
      } catch (error) {
        return (error as Error).name;
      }
    });

    expect(refusal).toBe('TypeError');
    await expect
      .poll(() => cspViolations.map(({ directive }) => directive))
      .toContain('require-trusted-types-for');
    cspViolations.splice(0);
  });

  test('when a script on the page writes markup into the page, then the browser refuses it', async ({
    page,
    cspViolations,
  }) => {
    await page.goto('/');

    const refusal = await page.evaluate(() => {
      try {
        document.body.insertAdjacentHTML('beforeend', '<p id="planted">x</p>');
        return 'admitted';
      } catch (error) {
        return (error as Error).name;
      }
    });

    expect(refusal).toBe('TypeError');
    await expect(page.locator('#planted')).toHaveCount(0);
    await expect
      .poll(() => cspViolations.map(({ directive }) => directive))
      .toEqual(['require-trusted-types-for']);
    cspViolations.splice(0);
  });

  for (const [address, what] of [
    [CROSS_ORIGIN_WORKER, 'another origin'],
    ['data:text/javascript,postMessage(1)', 'a data address'],
    ['/main.js', 'a script of the site that is no worker'],
  ]) {
    test(`when a script on the page starts a worker from ${what}, then the site policy refuses it`, async ({
      page,
      cspViolations,
    }) => {
      await page.goto('/');

      const refusal = await page.evaluate((url) => {
        try {
          new Worker(url, { type: 'module' }).terminate();
          return 'admitted';
        } catch (error) {
          return (error as Error).name;
        }
      }, address);

      expect(refusal).toBe('TypeError');
      await expect
        .poll(() => cspViolations.map(({ directive }) => directive))
        .toEqual(['require-trusted-types-for']);
      cspViolations.splice(0);
    });
  }

  test('when a script on the page starts a worker from a blob of the site, then the site policy refuses it', async ({
    page,
    cspViolations,
  }) => {
    await page.goto('/');

    const refusal = await page.evaluate(() => {
      const url = URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }));
      try {
        new Worker(url).terminate();
        return 'admitted';
      } catch (error) {
        return (error as Error).name;
      } finally {
        URL.revokeObjectURL(url);
      }
    });

    expect(refusal).toBe('TypeError');
    await expect
      .poll(() => cspViolations.map(({ directive }) => directive))
      .toEqual(['require-trusted-types-for']);
    cspViolations.splice(0);
  });

  test('when a script on the page creates a second default policy or one of its own, then the browser refuses both', async ({
    page,
    cspViolations,
  }) => {
    await page.goto('/');

    const refusals = await page.evaluate(() => {
      const factory = (
        window as unknown as {
          trustedTypes: { createPolicy(name: string, rules: object): unknown };
        }
      ).trustedTypes;
      return ['default', 'planted'].map((name) => {
        try {
          factory.createPolicy(name, { createScriptURL: (input: string) => input });
          return 'admitted';
        } catch (error) {
          return (error as Error).name;
        }
      });
    });

    expect(refusals).toEqual(['TypeError', 'TypeError']);
    await expect
      .poll(() => cspViolations.map(({ directive }) => directive))
      .toEqual(['trusted-types', 'trusted-types']);
    cspViolations.splice(0);
  });

  test('when another script made a default policy before the site starts, then the site still opens', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const factory = (
        window as unknown as {
          trustedTypes?: { createPolicy(name: string, rules: object): unknown };
        }
      ).trustedTypes;
      factory?.createPolicy('default', {});
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('when a script on the page writes a worker address of the site into a script element, then the site policy refuses it', async ({
    page,
    cspViolations,
  }) => {
    await page.goto('/');

    const refusal = await page.evaluate(() => {
      try {
        document.createElement('script').src = '/worker-F2S2AQ7E.js';
        return 'admitted';
      } catch (error) {
        return (error as Error).name;
      }
    });

    expect(refusal).toBe('TypeError');
    await expect
      .poll(() => cspViolations.map(({ directive }) => directive))
      .toEqual(['require-trusted-types-for']);
    cspViolations.splice(0);
  });
});
