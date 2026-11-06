import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CI_PORT, DERIVED_PORT_RANGE, checkoutMarkerPath, devPort } from './dev-port.mjs';

const ROOT = '/Users/someone/worktrees/nfnn-web/t3-0001';

describe('Given a worktree outside CI without a chosen port', () => {
  it('when its port is derived twice, then it is the same port both times', () => {
    assert.equal(devPort({ root: ROOT, env: {} }), devPort({ root: ROOT, env: {} }));
  });

  it('when its port is derived, then it lies in the range kept for worktrees', () => {
    const port = devPort({ root: ROOT, env: {} });

    assert.ok(port >= DERIVED_PORT_RANGE.first && port <= DERIVED_PORT_RANGE.last, `${port}`);
  });

  it('when another worktree derives its port, then the two differ', () => {
    assert.notEqual(
      devPort({ root: ROOT, env: {} }),
      devPort({ root: '/Users/someone/worktrees/nfnn-web/t3-0002', env: {} }),
    );
  });

  it('when many worktrees derive their ports, then each lies in the range and none is the CI port', () => {
    for (let index = 0; index < 500; index += 1) {
      const port = devPort({ root: `/tmp/worktree-${index}`, env: {} });
      assert.ok(port >= DERIVED_PORT_RANGE.first && port <= DERIVED_PORT_RANGE.last, `${port}`);
      assert.notEqual(port, CI_PORT);
    }
  });
});

describe('Given the port is chosen through NFNN_DEV_PORT', () => {
  it('when the port is derived, then the chosen port wins', () => {
    assert.equal(devPort({ root: ROOT, env: { NFNN_DEV_PORT: '4300' } }), 4300);
  });

  it('when CI is set too, then the chosen port still wins', () => {
    assert.equal(devPort({ root: ROOT, env: { NFNN_DEV_PORT: '4300', CI: 'true' } }), 4300);
  });

  it('when it is no port number, then it is refused', () => {
    for (const value of ['abc', '0', '70000', '42.5']) {
      assert.throws(() => devPort({ root: ROOT, env: { NFNN_DEV_PORT: value } }), /NFNN_DEV_PORT/);
    }
  });

  it('when it is empty, then the port is derived as without it', () => {
    assert.equal(
      devPort({ root: ROOT, env: { NFNN_DEV_PORT: '' } }),
      devPort({ root: ROOT, env: {} }),
    );
  });
});

describe('Given CI', () => {
  it('when the port is derived, then it is 4200 as before', () => {
    assert.equal(devPort({ root: ROOT, env: { CI: 'true' } }), 4200);
  });
});

describe('Given a checkout on a disk that ignores letter case', () => {
  it('when its path is written in other letter case, then its port and marker stay the same', (context) => {
    const root = mkdtempSync(join(tmpdir(), 'nfnn-Dev-Port-'));
    const otherCase = root.replace('nfnn-Dev-Port-', 'NFNN-dev-port-');
    if (!existsSync(otherCase)) {
      context.skip('this disk tells letter case apart');
      return;
    }

    assert.equal(devPort({ root: otherCase, env: {} }), devPort({ root, env: {} }));
    assert.equal(checkoutMarkerPath(otherCase), checkoutMarkerPath(root));
  });
});

describe('Given the marker path a checkout answers', () => {
  it('when it is derived twice, then it is the same path under /__nfnn-checkout/', () => {
    assert.equal(checkoutMarkerPath(ROOT), checkoutMarkerPath(ROOT));
    assert.match(checkoutMarkerPath(ROOT), /^\/__nfnn-checkout\/[0-9a-f]{64}$/);
  });

  it('when another checkout derives its marker, then the two differ', () => {
    assert.notEqual(
      checkoutMarkerPath(ROOT),
      checkoutMarkerPath('/Users/someone/worktrees/nfnn-web/t3-0002'),
    );
  });
});
