import type { PromptPackage } from "../types";

type PromptPackageModalProps = {
  promptPackage: PromptPackage | null;
  isOpen: boolean;
  onClose: () => void;
};

export function PromptPackageModal({ promptPackage, isOpen, onClose }: PromptPackageModalProps) {
  if (!isOpen || !promptPackage) {
    return null;
  }

  return (
    <div className="prompt-package-modal-backdrop">
      <div className="prompt-package-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-package-title">
        <div className="chapter-workspace-panel-header">
          <div>
            <h2 id="prompt-package-title">Prompt Package</h2>
          </div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="prompt-package-modal-body">
          <section aria-label="Full Prompt">
            <h3>Full Prompt</h3>
            <p>{promptPackage.fullPrompt}</p>
          </section>
          <section aria-label="Negative Constraints">
            <h3>Negative Constraints</h3>
            <p>{promptPackage.negativeConstraints}</p>
          </section>
          {promptPackage.shortPrompt ? (
            <section aria-label="Short Prompt">
              <h3>Short Prompt</h3>
              <p>{promptPackage.shortPrompt}</p>
            </section>
          ) : null}
          {promptPackage.revisionPrompt ? (
            <section aria-label="Revision Prompt">
              <h3>Revision Prompt</h3>
              <p>{promptPackage.revisionPrompt}</p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
