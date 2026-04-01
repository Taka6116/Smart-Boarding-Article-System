/**
 * 内部リンク候補：Smart Boarding 公式サイトのお役立ち・事例など。
 * URLはクライアントの公開サイトに合わせて編集してください。
 */
export interface LinkBankItem {
  label: string
  url: string
  category: 'useful' | 'case'
}

export const LINK_BANK: LinkBankItem[] = [
  {
    category: 'useful',
    label: 'Smart Boarding とは（オンラインデモ）',
    url: 'https://www.smartboarding.net/onlinedemo/',
  },
  {
    category: 'useful',
    label: '料金・プラン',
    url: 'https://www.smartboarding.net/price/',
  },
  {
    category: 'useful',
    label: 'お役立ち資料一覧',
    url: 'https://www.smartboarding.net/documents/',
  },
  {
    category: 'useful',
    label: '無料トライアル',
    url: 'https://www.smartboarding.net/trial/',
  },
  {
    category: 'case',
    label: '導入事例（公式）',
    url: 'https://www.smartboarding.net/example/11816/',
  },
  {
    category: 'case',
    label: '事例集ダウンロード',
    url: 'https://www.smartboarding.net/documents/1978/',
  },
  {
    category: 'case',
    label: 'お問い合わせ',
    url: 'https://www.smartboarding.net/contact/',
  },
]

export const LINK_BANK_USEFUL = LINK_BANK.filter((x) => x.category === 'useful')
export const LINK_BANK_CASE = LINK_BANK.filter((x) => x.category === 'case')
