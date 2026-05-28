from desktopcal.cli import safe_change_name


def test_safe_change_name_normalizes_spaces_and_case() -> None:
    assert safe_change_name("Bootstrap Windows Tauri") == "bootstrap-windows-tauri"


def test_safe_change_name_rejects_empty_names() -> None:
    try:
        safe_change_name("!!!")
    except ValueError:
        return
    raise AssertionError("expected ValueError")

