# Require explicit Assembly readiness

Assembly Ready requires one selected Empty Scene Image, at least one placed Scene Asset, valid placement transforms and layer order, no deleted asset references, and explicit coverage or exemption for target objects. The Studio can then project a Final Chapter Scene preview; silently omitting target objects is not a valid ready state.

**Considered Options**

- Treat any non-empty assembly as ready: simple to validate, but it hides missing target objects and lets incomplete chapter scenes pass.
- Require explicit coverage or exemption: adds author decisions, but makes readiness reflect the actual chapter asset goal.
