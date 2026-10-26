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

  async function submit(password: string, returnUrl?: string) {
    const fixture = TestBed.createComponent(LoginPage);
    if (returnUrl) fixture.componentRef.setInput('returnUrl', returnUrl);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('input[type=password]')!;
    input.value = password;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    return { fixture, element };
  }

  async function respond(status: number) {
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ password: 'secret' });
    request.flush({}, { status, statusText: String(status) });
    // Let the awaited promise chain in submit() settle.
    await new Promise((resolve) => setTimeout(resolve));
  }

  it.each([
    [401, 'Napačno geslo.'],
    [429, 'Preveč poskusov. Poskusi znova čez nekaj minut.'],
    [500, 'Prijava ni uspela. Poskusi znova.'],
  ])('shows the error for HTTP %i', async (status, message) => {
    const { fixture, element } = await submit('secret');
    await respond(status);
    await fixture.whenStable();

    expect(element.querySelector('[role=alert]')?.textContent?.trim()).toBe(message);
    expect(element.querySelector<HTMLInputElement>('input')!.value).toBe('');
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
