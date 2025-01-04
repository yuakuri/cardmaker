// 簡易的なNGワードの設定
var NGComments = ["死ね", "バカ", ".exe"];
var regex = new RegExp(NGComments.join("|"));

function test(wcheck) {
    if (wcheck.match(regex) != null) {
        alert("ERROR: コメントにNGワードが含まれています");
        return false;
    }

    // ボタンを無効化
    document.getElementById("submitbutton").disabled = true;

    // テキストエリア内の特殊文字をエスケープ
    let textareas = document.getElementsByTagName('textarea');
    for (let i = 0; i < textareas.length; i++) {
        textareas[i].value = textareas[i].value.replace(/</g, '&lt;');
    }

    // 入力欄内の特殊文字をエスケープ
    let inputs = document.getElementsByTagName('input');
    for (let i = 0; i < inputs.length; i++) {
        inputs[i].value = inputs[i].value.replace(/</g, '&lt;');
    }

    return submitted = true;
}
