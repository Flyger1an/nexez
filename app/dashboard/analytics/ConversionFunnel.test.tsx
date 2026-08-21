// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '../../../test/dom'
import { ConversionFunnel } from './ConversionFunnel'

describe('ConversionFunnel', () => {
  it('renders every canonical stage and adjacent rate', () => {
    render(<ConversionFunnel visits={100} attempts={40} starts={20} paid={10} retained={9} attributionComplete />)

    for (const label of ['Listing visits', 'Checkout intent', 'Checkout starts', 'Paid direct', 'Payment retained']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('40.0%')).toBeInTheDocument()
    expect(screen.getAllByText('50.0%')).toHaveLength(2)
    expect(screen.getByText('90.0%')).toBeInTheDocument()
    expect(screen.queryByText(/outside the matching checkout-start window/i)).not.toBeInTheDocument()
  })

  it('withholds a misleading paid rate when the selected windows do not match', () => {
    render(<ConversionFunnel visits={0} attempts={0} starts={1} paid={2} retained={2} attributionComplete={false} />)
    expect(screen.getByText(/paid rate is withheld/i)).toBeInTheDocument()
  })
})
