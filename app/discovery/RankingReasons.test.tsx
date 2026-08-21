// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '../../test/dom'
import { RankingReasons } from './RankingReasons'

describe('RankingReasons', () => {
  it('renders at most three evidence-backed reasons in an accessible region', () => {
    render(<RankingReasons reasons={['Relevant offer', 'Exact service area', 'Available', 'Fresh']} />)

    expect(screen.getByLabelText('Why this result ranks')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Relevant offer')
    expect(items[1]).toHaveTextContent('Exact service area')
    expect(items[2]).toHaveTextContent('Available')
    expect(screen.queryByText('Fresh')).not.toBeInTheDocument()
  })

  it('renders nothing without ranking evidence', () => {
    const { container } = render(<RankingReasons reasons={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
