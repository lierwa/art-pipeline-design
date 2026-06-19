from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from PIL import Image

from art_pipeline.codex_assets import CodexAssetRequest
from art_pipeline.model_runners.codex_cli import CodexCliAssetProvider


def test_codex_cli_provider_runs_codex_exec_with_semantic_context_images(tmp_path: Path) -> None:
    reference_path = tmp_path / "reference.png"
    source_crop_path = tmp_path / "source_crop.png"
    mask_path = tmp_path / "mask.png"
    Image.new("RGBA", (4, 4), (255, 0, 0, 255)).save(reference_path, format="PNG")
    Image.new("RGBA", (4, 4), (0, 0, 255, 255)).save(source_crop_path, format="PNG")
    Image.new("L", (4, 4), 255).save(mask_path, format="PNG")
    output_path = tmp_path / "final.png"
    calls: list[list[str]] = []

    def runner(args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        assert kwargs["cwd"] == tmp_path
        assert "$imagegen" in kwargs["input"]
        Image.new("RGBA", (4, 4), (0, 255, 0, 255)).save(output_path, format="PNG")
        return subprocess.CompletedProcess(args, 0, stdout='{"assetPath":"final.png"}', stderr="")

    provider = CodexCliAssetProvider(
        codex_bin="codex-test",
        runner=runner,
        timeout_seconds=3,
        sandbox="workspace-write",
    )
    request = CodexAssetRequest(
        element_id="element_001",
        element_name="Sticker",
        reference_image_path=reference_path,
        source_crop_path=source_crop_path,
        mask_path=mask_path,
        image_paths=(source_crop_path, reference_path, mask_path),
        output_path=output_path,
        work_dir=tmp_path,
        prompt="Use $imagegen to create final.png.",
    )

    provider.generate(request)

    assert calls
    args = calls[0]
    assert args[:4] == ["codex-test", "-a", "never", "exec"]
    assert "--ephemeral" in args
    assert "--skip-git-repo-check" in args
    assert args[args.index("--sandbox") + 1] == "workspace-write"
    image_index = args.index("--image")
    assert args[image_index + 1:image_index + 4] == [
        str(source_crop_path),
        str(reference_path),
        str(mask_path),
    ]
    assert output_path.exists()
