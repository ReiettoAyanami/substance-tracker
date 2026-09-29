import { FlexibleConnectedPositionStrategy } from '@angular/cdk/overlay';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';

import { IdentityColorPipe } from '../identity-color-pipe';
import { BatchBar } from './batch-bar';

describe('BatchBar', () => {
  let fixture: ComponentFixture<BatchBar>;

  async function render(name: string | null, unitPrice: string): Promise<HTMLElement> {
    fixture = TestBed.createComponent(BatchBar);
    fixture.componentRef.setInput('batchId', 6);
    fixture.componentRef.setInput('name', name);
    fixture.componentRef.setInput('unitPrice', unitPrice);
    fixture.componentRef.setInput('unit', 'capsula');
    fixture.componentRef.setInput('currency', 'EUR');
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('.fill');
  }

  /** Visible text with non-breaking spaces as plain spaces. */
  const text = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BatchBar],
    }).compileComponents();
  });

  it('is drawn in the identity colour of its batch', async () => {
    const fill = await render('Lavazza', '0.350184');

    expect(fill.style.backgroundColor).toBe(new IdentityColorPipe().transform(6, 'batch'));
  });

  it('shows the name and, below it, the unit price rounded to cents, when hovered', async () => {
    const fill = await render('Lavazza', '0.350184');

    fill.dispatchEvent(new MouseEvent('mouseenter'));
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    const shown = document.querySelector('.batch-bar-tooltip');
    expect(shown?.textContent?.split('\n').map(text)).toEqual(['Lavazza', '0,35 €/capsula']);
  });

  it('anchors the tooltip to the mouse and moves it with the mouse', async () => {
    const fill = await render('Lavazza', '0.350184');

    fill.dispatchEvent(new MouseEvent('mouseenter', { clientX: 10, clientY: 20 }));
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    const tooltip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    const strategy = tooltip._overlayRef?.getConfig().positionStrategy;
    expect(strategy).toBeInstanceOf(FlexibleConnectedPositionStrategy);
    const setOrigin = vi.spyOn(strategy as FlexibleConnectedPositionStrategy, 'setOrigin');

    fill.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 22 }));
    expect(setOrigin).toHaveBeenCalledWith({ x: 40, y: 22 });
  });

  it('calls a batch without a name "Lotto senza nome"', async () => {
    await render(null, '0.320000');

    const tooltip = fixture.debugElement.query(By.directive(MatTooltip)).injector.get(MatTooltip);
    expect(tooltip.message.split('\n').map(text)).toEqual(['Lotto senza nome', '0,32 €/capsula']);
  });

  it('keeps the click after a long press on touch to itself; a tap and a mouse click go through', async () => {
    const fill = await render('Lavazza', '0.350184');
    const press = (pointerType: string) => {
      const event = new Event('pointerdown', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      fill.dispatchEvent(event);
    };
    const longer = () => new Promise((resolve) => setTimeout(resolve, 550));
    const reached: string[] = [];
    const listen = (label: string) => {
      const listener = () => reached.push(label);
      document.addEventListener('click', listener, { once: true });
      fill.click();
      document.removeEventListener('click', listener);
    };

    press('touch');
    listen('tap');
    press('touch');
    await longer();
    listen('long press');
    press('mouse');
    await longer();
    listen('slow mouse click');

    expect(reached).toEqual(['tap', 'slow mouse click']);
  });
});
