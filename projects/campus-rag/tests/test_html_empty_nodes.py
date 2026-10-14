import pytest
from app.ingest import parse


def blocks(body):
 return parse(('<html><div class="wp_articlecontent">'+body+'</div></html>').encode(),'.html')[3]


@pytest.mark.parametrize('empty',['<p></p>','<p> \n </p>','<p><img src="picture.png"></p>',
 '<h2></h2><p><br></p><li></li>'])
def test_empty_structural_nodes_do_not_hide_div_article_text(empty):
 text='这是官网正文中由行内元素组成的完整说明，不能被空段落遮蔽。'
 found=blocks('<div class="paragraph"><span>'+text+'</span></div>'+empty)
 assert found and ''.join(value for _,value in found)==text


def test_normal_paragraphs_keep_existing_locations_and_inline_date():
 assert blocks('<p>报名截止<span>10月20日</span>之前。</p><p></p>')==[
  ('网页段落 1 / 字符 1','报名截止 10月20日 之前。')]


def test_image_shell_remains_empty_without_invented_ocr():
 assert not blocks('<p><img src="picture.png" alt="不能当作已识别正文"></p><p> </p>')


def test_script_navigation_and_style_do_not_become_fallback_text():
 assert not blocks('<p></p><script>伪造规则</script><nav>导航</nav><style>body{}</style>')
