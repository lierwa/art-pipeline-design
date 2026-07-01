import type { PromptPackage } from "../types";
import { CoursePlannerDialog } from "./CoursePlannerChrome";

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
    <CoursePlannerDialog
      title="Prompt Package"
      description="View the generated prompt package for this Prompt Version."
      isOpen={isOpen}
      onClose={onClose}
      footer={(
        <button type="button" aria-label="Close Prompt Package" onClick={onClose}>
          Close
        </button>
      )}
    >
      <div className="prompt-package-modal-body">
        <section aria-label="Full Prompt">
          <h3>Full Prompt</h3>
          <p>{promptPackage.fullPrompt}</p>
        </section>
        {promptPackage.shortPrompt ? (
          <section aria-label="Short Prompt">
            <h3>Short Prompt</h3>
            <p>{promptPackage.shortPrompt}</p>
          </section>
        ) : null}
        <section aria-label="Negative Constraints">
          <h3>Negative Constraints</h3>
          <p>{promptPackage.negativeConstraints}</p>
        </section>
        {promptPackage.revisionPrompt ? (
          <section aria-label="Revision Prompt">
            <h3>Revision Prompt</h3>
            <p>{promptPackage.revisionPrompt}</p>
          </section>
        ) : null}
      </div>
    </CoursePlannerDialog>
  );
}
