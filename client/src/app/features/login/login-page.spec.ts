import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { translocoTesting } from '../../../testing/transloco-testing';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage, translocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  async function type(element: HTMLElement, selector: string, value: string) {
    const input = element.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function submit(password: string, returnUrl?: string) {
    const fixture = TestBed.createComponent(LoginPage);
    if (returnUrl) fixture.componentRef.setInput('returnUrl', returnUrl);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    await type(element, '#email', ' nik@example.com ');
    await type(element, '#password', password);
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    return { fixture, element };
  }

  async function respond(status: number) {
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ email: 'nik@example.com', password: 'secret' });
    request.flush({ email: 'nik@example.com' }, { status, statusText: String(status) });
    // Let the awaited promise chain in submit() settle.
    await new Promise((resolve) => setTimeout(resolve));
  }

  it.each([
    [401, 'Napačen e-naslov ali geslo.'],
    [429, 'Preveč poskusov. Poskusi znova čez nekaj minut.'],
    [500, 'Prijava ni uspela. Poskusi znova.'],
  ])('shows the error for HTTP %i', async (status, message) => {
    const { fixture, element } = await submit('secret');
    await respond(status);
    await fixture.whenStable();

    expect(element.querySelector('[role=alert]')?.textContent?.trim()).toBe(message);
  });

  it('clears the password after a wrong one', async () => {
    const { fixture, element } = await submit('secret');
    await respond(401);
    await fixture.whenStable();

    expect(element.querySelector<HTMLInputElement>('#password')!.value).toBe('');
  });

  it('creates an account with an invite code', async () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('.switch')!.click();
    await fixture.whenStable();
    await type(element, '#email', 'teja@example.com');
    await type(element, '#password', 'a long password');
    await type(element, '#code', ' koda ');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));

    const request = http.expectOne('/api/auth/signup');
    expect(request.request.body).toEqual({
      email: 'teja@example.com',
      password: 'a long password',
      code: 'koda',
    });
    request.flush({ email: 'teja@example.com' }, { status: 201, statusText: 'Created' });
    await new Promise((resolve) => setTimeout(resolve));

    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('says so when the invite code is wrong', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.switch')!.click();
    await fixture.whenStable();
    await type(element, '#email', 'teja@example.com');
    await type(element, '#password', 'a long password');
    await type(element, '#code', 'nope');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));

    http.expectOne('/api/auth/signup').flush({}, { status: 403, statusText: 'Forbidden' });
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    expect(element.querySelector('[role=alert]')?.textContent?.trim()).toBe(
      'Napačna koda za povabilo.',
    );
  });

  it('goes to the return URL after logging in', async () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await submit('secret', '/?q=kava');
    await respond(200);

    expect(navigate).toHaveBeenCalledWith('/?q=kava');
  });

  it('never follows a return URL to another site', async () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await submit('secret', '//evil.example/');
    await respond(200);

    expect(navigate).toHaveBeenCalledWith('/');
  });
});
