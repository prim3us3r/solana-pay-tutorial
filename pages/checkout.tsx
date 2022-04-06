import {
  findTransactionSignature,
  FindTransactionSignatureError,
  createQR,
  encodeURL,
  EncodeURLComponents,
} from '@solana/pay'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { Keypair, Transaction, clusterApiUrl, PublicKey } from '@solana/web3.js'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState, useRef } from 'react'
import BackLink from '../components/BackLink'
import Loading from '../components/Loading'
import {
  MakeTransactionInputData,
  MakeTransactionOutputData,
} from './api/makeTransaction'
import { shopAddress, usdcAddress } from './../lib/addresses'
import calculatePrice from './../lib/calculatePrice'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}
export default function Checkout() {
  const router = useRouter()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()

  // ref to a div where we'll show the QR code
  const qrRef = useRef<HTMLDivElement>(null)
  const amount = useMemo(() => calculatePrice(router.query), [router.query])

  // Get a connection to Solana devnet
  const network = WalletAdapterNetwork.Devnet
  const endpoint = clusterApiUrl(network)

  // Show the QR code
  useEffect(() => {
    const qr = createQR(url, 512, 'transparent')
    if (qrRef.current && amount.isGreaterThan(0)) {
      qrRef.current.innerHTML = ''
      qr.append(qrRef.current)
    }
  })

  // State to hold API response fields
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Read the URL query (which includes our chosen products)
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(router.query)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) {
          searchParams.append(key, v)
        }
      } else {
        searchParams.append(key, value)
      }
    }
  }

  // Generate the unique reference which will be used for this transaction
  const reference = useMemo(() => Keypair.generate().publicKey, [])

  // Solana Pay transfer params
  const urlParams: EncodeURLComponents = {
    recipient: shopAddress,
    splToken: usdcAddress,
    amount,
    reference,
    label: 'Cupcake Coding Co',
    message: 'Thanks for your order! 🧁',
  }
  // Add it to the params we'll pass to the API
  searchParams.append('reference', reference.toString())

  // Encode the params into the format shown
  const url = encodeURL(urlParams)
  console.log({ url })

  // Use our API to fetch the transaction for the selected items
  async function getTransaction() {
    if (!publicKey) {
      return
    }

    const body: MakeTransactionInputData = {
      account: publicKey.toString(),
    }

    const response = await fetch(
      `/api/makeTransaction?${searchParams.toString()}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    const json = (await response.json()) as MakeTransactionOutputData

    if (response.status !== 200) {
      console.error(json)
      return
    }

    // Deserialize the transaction from the response
    const transaction = Transaction.from(
      Buffer.from(json.transaction, 'base64')
    )
    setTransaction(transaction)
    setMessage(json.message)
    console.log(transaction)
  }

  useEffect(() => {
    getTransaction()
  }, [publicKey])

  // Send the fetched transaction to the connected wallet
  async function trySendTransaction() {
    if (!transaction) {
      return
    }
    try {
      await sendTransaction(transaction, connection)
    } catch (e) {
      console.error(e)
    }
  }

  // Send the transaction once it's fetched
  useEffect(() => {
    trySendTransaction()
  }, [transaction])

  // Check every 0.5s if the transaction is completed
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Check if there is any transaction for the reference
        const signatureInfo = await findTransactionSignature(
          connection,
          reference
        )
        router.push('/confirmed')
      } catch (e) {
        if (e instanceof FindTransactionSignatureError) {
          // No transaction found yet, ignore this error
          return
        }
        console.error('Unknown error', e)
      }
    }, 500)
    return () => {
      clearInterval(interval)
    }
  }, [])

  if (!publicKey) {
    return (
      <div className="flex flex-col items-center gap-8">
        <div>
          <BackLink href="/buy">Cancel</BackLink>
        </div>
        <div ref={qrRef} />
        <WalletMultiButton />

        <p>You need to connect your wallet to make transactions</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <div>
        <BackLink href="/buy">Cancel</BackLink>
      </div>

      <WalletMultiButton />

      {message ? (
        <p>
          {message} Please approve the transaction using your wallet{' '}
          <div ref={qrRef} />
        </p>
      ) : (
        <p>
          Creating transaction... <Loading />
        </p>
      )}
    </div>
  )
}
