import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import '../styles/globals.css'

export const metadata = {
  title: {
    default: 'LumeSync（萤火课堂）文档',
    template: '%s - LumeSync'
  },
  description: 'LumeSync（萤火课堂）是面向局域网教室的课堂同步、课件渲染和互动教学工作区。'
}

const navbar = (
  <Navbar
    logo={<strong>LumeSync</strong>}
    projectLink="https://github.com/yc004/SyncClassroom"
  />
)

const footer = (
  <Footer>
    © {new Date().getFullYear()} LumeSync（萤火课堂）. Built with Nextra.
  </Footer>
)

export default async function RootLayout({ children }) {
  return (
    <html lang="zh-CN" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/yc004/SyncClassroom/tree/main/docs-site"
          editLink="编辑此页"
          feedback={{ content: '反馈文档问题' }}
          sidebar={{ autoCollapse: true, defaultMenuCollapseLevel: 1 }}
          toc={{ title: '本页目录', backToTop: '返回顶部' }}
          themeSwitch={{ dark: '深色', light: '浅色', system: '跟随系统' }}
          nextThemes={{ defaultTheme: 'system' }}
        >
          <aside style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--x-color-gray-300)', fontSize: '0.875rem', textAlign: 'center' }}>
            本站区分当前实现与目标设计：Electron 教师桌面壳已在 macOS 运行直接模式源码预览，教室 Hub 与会话代理（含验证码配对、授课租约）已完成首轮落地；中继桌面接线、TLS 与跨机实测尚未完成，新编辑器仅有设计文档。学生端与 Core 的当前检出不匹配根仓锁定提交。
          </aside>
          {children}
        </Layout>
      </body>
    </html>
  )
}
