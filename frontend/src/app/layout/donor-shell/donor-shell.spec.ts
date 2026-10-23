import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SideNav } from '../../shared/ui/side-nav/side-nav';
import { DonorShell } from './donor-shell';

@Component({
  imports: [SideNav],
  template: `<app-side-nav [groups]="[]" label="Oblast" menuLabel="Menu"
    ><h1>Přehled</h1></app-side-nav
  >`,
})
class Area {}

describe('Given the shell of the donor area and the administration', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DonorShell],
      providers: [provideRouter([{ path: '', component: Area }])],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(DonorShell);
    document.body.appendChild(fixture.nativeElement);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('when it renders, then a skip link is the first thing a keyboard reaches and the page content is the main landmark', async () => {
    const host = await render();

    const first = host.querySelector('a, button');
    expect(first?.textContent?.trim()).toBe('Přeskočit na obsah');
    expect(host.querySelectorAll('main')).toHaveLength(1);
    expect(host.querySelector('main')?.textContent).toContain('Přehled');
    host.remove();
  });

  it('when the skip link is activated, then the main content takes the focus and the URL stays', async () => {
    const host = await render();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });

    host.querySelector<HTMLAnchorElement>('.skip-link')!.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('main'));
    host.remove();
  });
});
