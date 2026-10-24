import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { NotFound } from './not-found';

describe('Given an address the site does not know', () => {
  let fixture: ComponentFixture<NotFound>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFound],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('when the page opens, then it says the page does not exist and leads home', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Tuhle stránku jsme nenašli');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/');
  });

  it('when the page opens for an unknown address, then it offers no list of articles or projects', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.ui-intro__lead')?.textContent?.trim()).toBe(
      'Odkaz je možná starý nebo v adrese chybí písmenko. Zbytek webu je na svém místě.',
    );
    expect(root.querySelectorAll('a')).toHaveLength(2);
  });

  it('when it stands for a news article that is gone, then it says so and leads to all the news first', () => {
    fixture.componentRef.setInput('missing', 'news');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.ui-intro__lead')?.textContent?.trim()).toBe(
      'Tato aktualita už na webu není.',
    );
    const links = Array.from(root.querySelectorAll('a')).map((link) => [
      link.getAttribute('href'),
      link.textContent?.trim(),
    ]);
    expect(links[0]).toEqual(['/aktuality', 'Všechny aktuality']);
    expect(links[1]).toEqual(['/', 'Zpět na úvodní stránku']);
  });

  it('when it stands for a project that is gone, then it says so and leads to all the projects first', () => {
    fixture.componentRef.setInput('missing', 'project');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.ui-intro__lead')?.textContent?.trim()).toBe(
      'Tento projekt už na webu není.',
    );
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/projekty');
    expect(root.querySelector('a')?.textContent?.trim()).toBe('Všechny projekty');
  });

  it('when the page opens, then search engines are asked not to index it, and leaving it lifts that', () => {
    const meta = TestBed.inject(Meta);
    expect(meta.getTag('name="robots"')?.content).toBe('noindex');

    fixture.destroy();

    expect(meta.getTag('name="robots"')).toBeNull();
  });
});
