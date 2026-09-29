import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { ApiError } from '../data/api-error';
import { CatalogApi } from '../data/catalog-api';
import { Substance } from '../data/substance';

/**
 * Asks before deleting a substance and deletes it (a soft delete of the substance with its batches
 * and consumptions). Closes with `true` on the 204, with nothing on cancel; on an error it stays
 * open and says why.
 */
@Component({
  selector: 'app-delete-substance-dialog',
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './delete-substance-dialog.html',
  styleUrl: './delete-substance-dialog.css',
})
export class DeleteSubstanceDialog {
  private readonly catalog = inject(CatalogApi);
  private readonly dialog = inject<MatDialogRef<DeleteSubstanceDialog, true>>(MatDialogRef);
  protected readonly substance = inject<Substance>(MAT_DIALOG_DATA);

  /** The request is out: Delete is disabled (no double submit). */
  protected readonly deleting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected confirm(): void {
    // The guard, not only the disabled button: a second tap can arrive before the view updates.
    if (this.deleting()) return;
    this.deleting.set(true);
    this.error.set(null);
    this.catalog.deleteSubstance(this.substance.id).subscribe({
      next: () => this.dialog.close(true),
      error: (error: ApiError) => {
        this.deleting.set(false);
        this.error.set(`Could not delete: ${error.title}${error.status ? ` (${error.status})` : ''}`);
      },
    });
  }

  protected cancel(): void {
    this.dialog.close();
  }
}
