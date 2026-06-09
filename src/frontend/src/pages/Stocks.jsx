import { useEffect, useState } from 'react'

const API = '/api/stocks'

export default function Stocks() {
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(null)

  async function fetchStocks() {
    try {
      const res = await fetch(API + '/')
      setStocks(await res.json())
    } catch {
      setError('Could not reach the API.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStocks() }, [])

  async function handleAdd(e) {
    e.preventDefault()
    await fetch(API + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, name }),
    })
    setSymbol('')
    setName('')
    fetchStocks()
  }

  async function handleDelete(id) {
    await fetch(`${API}/${id}`, { method: 'DELETE' })
    fetchStocks()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Stocks</h1>

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          placeholder="Symbol"
          required
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-28"
        />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Company name"
          required
          className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded hover:bg-blue-700"
        >
          Add
        </button>
      </form>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left text-gray-600">
              <th className="px-4 py-2 border border-gray-200">Symbol</th>
              <th className="px-4 py-2 border border-gray-200">Name</th>
              <th className="px-4 py-2 border border-gray-200"></th>
            </tr>
          </thead>
          <tbody>
            {stocks.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-gray-400 text-center">
                  No stocks yet.
                </td>
              </tr>
            ) : (
              stocks.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 border border-gray-200 font-mono font-semibold">{s.symbol}</td>
                  <td className="px-4 py-2 border border-gray-200">{s.name}</td>
                  <td className="px-4 py-2 border border-gray-200">
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
