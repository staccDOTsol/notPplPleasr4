import React from "react";
import { RouteComponentProps, } from "react-router-dom";
import queryString from 'query-string';
import { programs } from "@metaplex/js"
import fetch from 'node-fetch'

import ContentLoader from 'react-content-loader';
import { Button, Image } from 'antd';
import {
  Box,
  Card,
  Chip,
  Link as HyperLink,
  IconButton,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  Stack,
  Tooltip,
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import RemoveIcon from '@mui/icons-material/Remove';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import {
  AccountMeta,
  Connection as RPCConnection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
} from '@solana/spl-token'
import * as anchor from '@project-serum/anchor';
import {
  Connection,
  useConnectionConfig,
  chunks,
  decodeEdition,
  decodeMasterEdition,
  decodeMetadata,
  getMultipleAccounts, // wrapper that does chunking
  getUnixTs,
  Metadata,
  MetadataKey,
  notify,
  shortenAddress,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  Wallet,
} from '@oyster/common';
import BN from 'bn.js';
import { capitalize } from 'lodash';

import {
  useLoading,
} from '../../components/Loader';
import {
  CachedImageContent,
} from '../../components/ArtContent';
import {
  useAnchorContext,
} from '../../contexts/anchorContext';
import useWindowDimensions from '../../utils/layout';
import {
  getAssociatedTokenAccount,
  getEdition,
  getEditionMarkerPda,
  getMetadata,
} from '../../utils/accounts';
import {
  FIREBALL_PREFIX,
  FIREBALL_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
} from '../../utils/ids';
import {
  envFor,
  explorerLinkFor,
} from '../../utils/transactions';
import {
  MerkleTree,
} from "../../utils/merkleTree";

export const ThreeDots = () => (
  <ContentLoader
    viewBox="0 0 212 200"
    height={200}
    width={212}
    backgroundColor="transparent"
    style={{
      width: '100%',
      margin: 'auto',
    }}
  >
    <circle cx="86" cy="100" r="8" />
    <circle cx="106" cy="100" r="8" />
    <circle cx="126" cy="100" r="8" />
  </ContentLoader>
);

const createMintAndAccount = async (
  connection : RPCConnection,
  walletKey : PublicKey,
  mint : PublicKey,
  setup : Array<TransactionInstruction>,
) => {
  const walletTokenKey = await getAssociatedTokenAccount(
      walletKey, mint);

  setup.push(SystemProgram.createAccount({
    fromPubkey: walletKey,
    newAccountPubkey: mint,
    space: MintLayout.span,
    lamports:
      await connection.getMinimumBalanceForRentExemption(
        MintLayout.span,
      ),
    programId: TOKEN_PROGRAM_ID,
  }));

  setup.push(Token.createInitMintInstruction(
    TOKEN_PROGRAM_ID,
    mint,
    0,
    walletKey,
    walletKey,
  ));

  setup.push(Token.createAssociatedTokenAccountInstruction(
    SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    walletTokenKey,
    walletKey,
    walletKey
  ));

  setup.push(Token.createMintToInstruction(
    TOKEN_PROGRAM_ID,
    mint,
    walletTokenKey,
    walletKey,
    [],
    1,
  ));

}

type MintAndImage = {
  mint: PublicKey,
  name: string,
  image: string,
  description: string,
};

type RelevantMint = MintAndImage & { ingredients : Array<string> };

type OnChainIngredient = RelevantMint;

type WalletIngredient = RelevantMint & {
  tokenAccount : PublicKey,
  mint: PublicKey,
  uri: string,
  parent ?: {
    edition : PublicKey,
    masterMint : PublicKey,
    masterEdition : PublicKey,
  },
};

// remaining is never technically strictly up-to-date...
// TODO: add as of block height?
type RecipeYield = MintAndImage & { remaining : number };

type DedupIngredientMint = {
  asset: React.ReactElement,
  selected: PublicKey | null,
};

const fetchMintsAndImages = async (
  connection : RPCConnection,
  mintKeys : Array<PublicKey>
) : Promise<Array<MintAndImage>> => {
  const metadataKeys = await Promise.all(mintKeys.map(getMetadata));
  const metadataAccounts = await (connection as any).getMultipleAccountsInfo(metadataKeys);

  const metadatasDecoded : Array<Metadata> = metadataAccounts
    .map((account, idx) => {
      if (account === null) {
        const missingMint = mintKeys[idx].toBase58();
        notify({
          message: 'Fetch mint failed',
          description: `Could not fetch metadata for mint ${missingMint}`,
        });
        return null;
      }

      return decodeMetadata(account.data);
    })
    .filter((ret) : ret is Metadata => ret !== null);

  const schemas = await Promise.all(metadatasDecoded.map(m => fetch(m.data.uri)));
  const schemaJsons = await Promise.all(schemas.map(s => s.json()));

  console.log(schemaJsons);

  return schemaJsons.map((schema, idx) => {
    return {
      mint: new PublicKey(metadatasDecoded[idx].mint),
      name: schema.name,
      image: schema.image,
      description: schema.description,
    };
  });
};

export const getEditionsRemaining = async (
  connection : RPCConnection,
  masterMints: Array<PublicKey>,
) => {
  const masterEditions = await Promise.all(masterMints.map(m => getEdition(m)));

  const editionAccounts = await (connection as any).getMultipleAccountsInfo(masterEditions);
  return editionAccounts
    .map((account, idx) => {
      if (account === null) {
        const missingMint = masterMints[idx].toBase58();
        console.warn(`Could not fetch master edition for mint ${missingMint}`);
        return null;
      }

      const edition = decodeMasterEdition(account.data);
      if (!edition.maxSupply) {
        return NaN;
      }
      const maxSupply = new BN(edition.maxSupply);
      const supply = new BN(edition.supply);
      if (supply.gte(maxSupply)) {
        return [0, maxSupply.toNumber()];
      } else {
        return [maxSupply.sub(supply).toNumber(), maxSupply.toNumber()];
      }
    })
    .reduce((acc, n, idx) => {
      return {
        ...acc,
        [masterMints[idx].toBase58()]: n,
      }
    },
    {});
}

export const remainingText = (rem) => {
  return ''; // TODO?
  if (rem.remaining === null) {
    return ''; // not found
  }
  if (typeof rem.remaining === 'number' && isNaN(rem.remaining)) {
    return ''; // TODO?
  }
  if (rem.remaining[0] === 0) {
    return 'SOLD OUT';
  }
  return `${rem.remaining[0]}/${rem.remaining[1]} remaining`;
};

const getRecipeYields = async (
  connection : RPCConnection,
  masterMints : Array<PublicKey>,
) => {
  const remaining = await getEditionsRemaining(connection, masterMints);

  return (await fetchMintsAndImages(
      connection,
      masterMints,
    ))
    .map(r => ({ ...r, remaining: remaining[r.mint.toBase58()] }));
};

const getOnChainIngredients = async (
  connection : RPCConnection,
  recipeKey : PublicKey,
  walletKey : PublicKey,
  ingredientList : Array<any>,
) => {
  const [dishKey, ] = await PublicKey.findProgramAddress(
    [
      FIREBALL_PREFIX,
      recipeKey.toBuffer(),
      walletKey.toBuffer(),
    ],
    FIREBALL_PROGRAM_ID,
  );

  const storeKeys = await Promise.all(ingredientList.map((group, idx) => {
          const ingredientNum = new BN(idx);
          return PublicKey.findProgramAddress(
            [
              FIREBALL_PREFIX,
              dishKey.toBuffer(),
              Buffer.from(ingredientNum.toArray('le', 8)),
            ],
            FIREBALL_PROGRAM_ID,
          );
        }));
console.log(ingredientList)
  const storeAccounts = await (connection as any).getMultipleAccountsInfo(storeKeys.map(s => s[0]));

  const mints = {};
  for (let idx = 0; idx < ingredientList.length; ++idx) {
    const group = ingredientList[idx];
    const storeAccount = storeAccounts[idx];
    if (storeAccount !== null) {
      const currentStore = AccountLayout.decode(Buffer.from(storeAccount.data));
      const mint = new PublicKey(currentStore.mint).toBase58();
      if (!mints.hasOwnProperty(mint)) {
        mints[mint] = [];
      }
      mints[mint].push(group.ingredient);
    }
  }
  console.log(mints);
  const ingredientImages = await fetchMintsAndImages(
      connection, Object.keys(mints).map(r => new PublicKey(r)));
  const ret = ingredientImages.map(
      r => ({ ...r, ingredients: mints[r.mint.toBase58()] }));
  ret.sort((lft, rht) => lft.ingredients[0].localeCompare(rht.ingredients[0]));
  return ret;
};

const getRelevantTokenAccounts = async (
  connection : RPCConnection,
  walletKey : PublicKey,
  ingredientList : Array<any>,
): Promise<Array<WalletIngredient>> => {
  const mints = {};
  let hasLimitedEdition = false;
  for (const group of ingredientList)
    for (const [idx, mint] of group.mints.entries()) {
      if (!mints.hasOwnProperty(mint)) {
        mints[mint] = [];
      }

      const ingredientLimitedEdition = true//group.allowLimitedEditions && group.allowLimitedEditions[idx];
      mints[mint].push({
        ingredient: group.ingredient,
        allowLimitedEdition: ingredientLimitedEdition,
      });

      hasLimitedEdition = hasLimitedEdition || ingredientLimitedEdition;
    }

  const owned = await connection.getTokenAccountsByOwner(
      walletKey,
      { programId: TOKEN_PROGRAM_ID },
    );

  const decoded = owned.value.map(v => AccountLayout.decode(v.account.data));
  let editionParentKeys;
  const mintEditions = {};
  if (false) {
    console.log('No limited editions allowed. Skipping fetches');
    editionParentKeys = new Array(decoded.length);
  } else {
    for (const m of Object.keys(mints)) {
      const mint = mints[m];
      if (mint.length > 1) {
        console.error(`TODO: limited editions in multiple ingredient groups`);
       // return [];
      }

      const edition = (await getEdition(new PublicKey(m))).toBase58();
      mintEditions[edition] = {
        allowLimitedEdition: mint[0].allowLimitedEdition,
        ingredient: mint[0].ingredient,
        key: new PublicKey(m),
      };
    }

    const editionKeys = await Promise.all(decoded.map(async (a) => {
      const mint = new PublicKey(a.mint);
      return (await getEdition(mint)).toBase58();
    }));
    const editionDatas = (await getMultipleAccounts(
      // TODO: different commitment?
      connection, editionKeys, 'processed')).array;
    editionParentKeys = editionDatas.map(e => {
      if (!e) {
        // skip if this is a non-NFT token
        return undefined;
      }
      if (true){//e.data[0] == MetadataKey.EditionV1) {
        let hm = decodeEdition(e.data).parent;
        console.log(hm ) 
        return (hm)
      } else {
        return undefined;
      }
    });
  }

  const relevant = decoded
    .map((a, idx) => ({
      ...a,
      tokenAccount: owned.value[idx].pubkey,
      editionParentKey: editionParentKeys[idx],
    }))
    .filter(a => {
    const editionParentKey = a.editionParentKey;
    console.log(a)
    const mintMatches =
      (new PublicKey(a.mint).toBase58()) in mints
      || (editionParentKey && mintEditions[editionParentKey]?.allowLimitedEdition);
    const hasToken = new BN(a.amount, 'le').toNumber() > 0;
    return mintMatches && hasToken;
  });

  // TODO: getMultipleAccounts
  const relevantImages = await fetchMintsAndImages(
      connection, relevant.map(r => new PublicKey(r.mint)));
  const ret = await Promise.all(relevantImages.map(async (r, idx) => {
    // TODO: better
    const mint = r.mint.toBase58();
    const editionParentKey = relevant[idx].editionParentKey;
    console.log('TA for ', mint, relevant[idx].tokenAccount.toBase58());
    const metadatas = (await programs.metadata.Metadata.findByMint (connection, new PublicKey(mint)));
    let uri = await(await fetch(metadatas.data.data.uri)).json()
   
    if (mints.hasOwnProperty(mint)) {
      
      return {
        ...r,
        uri: uri.image,
        mint: new PublicKey(mint),
        ingredients: mints[mint].map(m => m.ingredient),
        tokenAccount: relevant[idx].tokenAccount,
      };
    } else {
      const parent = mintEditions[editionParentKey];
      if (!(await getEdition(parent.key)).equals(new PublicKey(editionParentKey))) {
        throw new Error(`internal error: mismatched master mint and parent edition`);
      }

      return {
        ...r,
        uri: uri.image,
        mint: new PublicKey(mint),
        ingredients: [parent.ingredient],  // lookup by parent edition
        tokenAccount: relevant[idx].tokenAccount,
        parent: {
          edition: await getEdition(new PublicKey(mint)),
          masterMint: parent.key,
          masterEdition: new PublicKey(editionParentKey),
        },
      };
    }
  }));
  console.log(ret);
  ret.sort((lft, rht) => lft.ingredients[0].localeCompare(rht.ingredients[0]));
  console.log(ret);
  // @ts-ignore
  return ret;
};

const fetchWalletIngredients = async (
  connection : RPCConnection,
  recipeKey : PublicKey,
  walletKey : PublicKey,
  ingredientList: Array<any>,
) => {
  const onChainIngredientsPromise = getOnChainIngredients(
      connection, recipeKey, walletKey, ingredientList);

  const relevantMintsPromise = getRelevantTokenAccounts(
      connection, walletKey, ingredientList);

  return await Promise.all([onChainIngredientsPromise, relevantMintsPromise]);
};

const fetchRelevantMints = async (
  anchorWallet : anchor.Wallet,
  program : anchor.Program,
  connection : RPCConnection,
  recipeKey : PublicKey,
) => {
  if (!anchorWallet || !program) {
    return;
  }

  const startTime = getUnixTs();

  let recipe;
  try {
    recipe = await program.account.recipe.fetch(recipeKey);
  } catch (err: any) {
    console.log(err)
    const recipeKeyStr = recipeKey.toBase58();
    throw new Error(`Failed to find recipe ${recipeKeyStr}`);
  }

  console.log('Finished recipe fetch', getUnixTs() - startTime);

  const ingredientUrl = recipe.ingredients.replace(/\0/g, '');
  var ingredientList = await (await fetch(ingredientUrl)).json();
  
  console.log('Finished ingredients fetch', getUnixTs() - startTime);

  if (recipe.roots.length !== ingredientList.length) {
    throw new Error(`Recipe has a different number of ingredient lists and merkle hashes. Bad configuration`);
  }

  const [onChainIngredients, relevantMints] = await fetchWalletIngredients(
      connection, recipeKey, anchorWallet.publicKey, ingredientList);

  console.log('Finished relevant tokens fetch', getUnixTs() - startTime);

  return {
    ingredientList,
    onChainIngredients,
    relevantMints,
  };
};

enum IngredientView {
  add = 'add',
  recover = 'recover',
}

export type Recipe = {
  image: string,
  name: string,
  mint: PublicKey,
};

async function uploadFile(wallet: any, file: any, fanout: any, authority: any, val: any, to:any): Promise<any> {
  
  const body = ({nft: file, fanout:fanout.toBase58(), who: wallet.toBase58(),val:val.toNumber(), to, prompt, environment: {label:'mainnet-beta'}})
  console.log(body)

  try {
    const response = await fetch('https://subscriptionservicebackend.herokuapp.com/handle', {
      //@ts-ignore
      body: JSON.stringify(body),
      method: 'POST',
      headers: {
        
        'Content-Type': 'application/json',
      },
    })

    const json = await response.json()
    return json
  }
  catch (err){
    
  }
}


export const FireballView = (
  props : {
    recipeKey : PublicKey,
    recipeYields : Array<Recipe>,
    ingredients : { [key: string]: string },
  }
) => {
  const { connection, endpoint, wallet, anchorWallet, program } = useAnchorContext();

  const recipeKey = props.recipeKey;
  var recipes = props.recipeYields;
  
  var ingredients = props.ingredients;
  const [prompt, setPrompt] = React.useState<string>("beautiful, ornate giant post-modern sphinx in the middle of dystopian time square")

  const [recipeYields, setRecipeYields] = React.useState<Array<RecipeYield>>([]);
  const [relevantMints, setRelevantMints] = React.useState<Array<WalletIngredient>>([]);
  const [ingredientList, setIngredientList] = React.useState<Array<any>>([]);
  const [dishIngredients, setIngredients] = React.useState<Array<OnChainIngredient>>([]);
  const [changeList, setChangeList] = React.useState<Array<any>>([]);

  // ingredient => mint
  type SelectedMint = { [key: string]: PublicKey };
  const [explicitMints, setExplicitMints] = React.useState<SelectedMint>({});
  const implicitMints = React.useMemo(() => {
    return Object.keys(ingredients).reduce((prevSelected: SelectedMint, ingredient: string): SelectedMint => {
      const selectedMint = explicitMints[ingredient];
      if (selectedMint) return { ...prevSelected };

      const matchingIngredients = relevantMints.filter(
        c => {
          // not explicitly selected
          return !Object.values(explicitMints).find(m => m.equals(c.mint))
            // or implicitly assigned to another group
            && !Object.values(prevSelected).find(m => m?.equals(c.mint))
            // and matches the ingredient
            && c.ingredients.find(i => i === ingredient);
        });
      if (matchingIngredients[0]) {
        return { ...prevSelected, [ingredient]: matchingIngredients[0].mint };
      } else {
        return { ...prevSelected };
      }
    }, {});
  }, [explicitMints, relevantMints]);

  const numIngredients = Object.keys(ingredients).length;
  const reduceIngredient = (acc: number, relevant: RelevantMint) => {
      return acc + +!!(relevant.ingredients.find(i => ingredients.hasOwnProperty(i)));
  };
  console.log(numIngredients)
  const collected = relevantMints.reduce(reduceIngredient, 0)
    + dishIngredients.reduce(reduceIngredient, 0);
    const distributeShare = async (
      idx: number,
      i: number,
      nft: string
    ) => {
    
      if (wallet && wallet.publicKey ) {
        console.log(i)
    let nft = relevantMints[idx].mint.toBase58()
    console.log(nft)
    let provider = new anchor.Provider(connection, (anchorWallet),{})
    
    const idl = await anchor.Program.fetchIdl(new PublicKey("84zHEoSwTo6pb259RtmeYQ5KNStik8pib815q7reZjdx"), provider);
    
    const program = new anchor.Program(idl as anchor.Idl, new PublicKey("84zHEoSwTo6pb259RtmeYQ5KNStik8pib815q7reZjdx"), provider);
    
    const state: any = await program.account.fanout.fetch(new PublicKey("DXNgVF6KaDkkYEjxSFTxKA4qxgW26FsFTFzgJfFDWAWw"));
    console.log('hmmm' + state.accountKey.toBase58())
        const metadatas = (await programs.metadata.Metadata.findByMint (connection, new PublicKey(nft)));
        console.log('hmm')
        const metadata = metadatas.pubkey
        console.log('hmm')

        
        // Initialize the Arweave Bundle Upload Generator.
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator
        const bytes = 1024 * 1024 * 10
          
        let env = 'mainnet-beta'
    
    
        let hehe2 =  (await uploadFile(wallet.publicKey, nft, new PublicKey("DXNgVF6KaDkkYEjxSFTxKA4qxgW26FsFTFzgJfFDWAWw"),
         new PublicKey("JARehRjGUkkEShpjzfuV4ERJS25j8XhamL776FAktNGm"),
        state.shares[i], state.traitOptions[i]))
        for (var creator of hehe2.body.creators){
          creator.address = new PublicKey(creator.address)
        }
        console.log(hehe2.tx)
        let tx =  new Transaction()
    
        // @ts-ignore
        // @ts-ignore
    
        const mint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
         const ata = (
          await Token.getAssociatedTokenAddress(ASSOCIATED_TOKEN_PROGRAM_ID,TOKEN_PROGRAM_ID,new PublicKey(nft),wallet.publicKey)
        )
        console.log(ata.toBase58())
        // @ts-ignore
        const sourceAccount = (
          await connection.getTokenAccountsByOwner(wallet.publicKey, {
            mint,
          })
        ).value[0].pubkey
        // @ts-ignore
        const tokenAccount = (
          await connection.getTokenAccountsByOwner(new PublicKey("JARehRjGUkkEShpjzfuV4ERJS25j8XhamL776FAktNGm"), {
            mint,
          })
        ).value[0].pubkey
        // @ts-ignore
        const tokenAccount2 = (
          await connection.getTokenAccountsByOwner(
            new PublicKey('JARehRjGUkkEShpjzfuV4ERJS25j8XhamL776FAktNGm'),
            { mint }
          )
        ).value[0].pubkey
        console.log(tokenAccount2.toBase58())
    // const itemsAvailable = state.data.itemsAvailable.toNumber();
    // const itemsRedeemed = state.itemsRedeemed.toNumber();
    // const itemsRemaining = itemsAvailable - itemsRedeemed;
    
    hehe2.body.val = state.shares[i]
    hehe2.body.to = state.traitOptions[i]
    // @ts-ignore
     tx.add   (await program.instruction.processSignMetadata(
    // @ts-ignore
          {val: hehe2.body.val, 
           to: hehe2.body.to ,
           sellerFeeBasisPoints: hehe2.body.sellerFeeBasisPoints,
           name: hehe2.body.name,
           creators: hehe2.body.creators,
           uri: hehe2.body.uri,
          symbol: hehe2.body.symbol},
          {
            accounts: {
              newUri: new PublicKey(hehe2.pubkey),
              nft: new PublicKey(nft),
              ata,
              jare: new PublicKey('JARehRjGUkkEShpjzfuV4ERJS25j8XhamL776FAktNGm'),
              mint,
              sourceAccount,
              tokenAccount,
              tokenAccount2,
              tokenProgram: TOKEN_PROGRAM_ID,
              tokenMetadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
              fanout: new PublicKey("DXNgVF6KaDkkYEjxSFTxKA4qxgW26FsFTFzgJfFDWAWw"),
              metadata,
              authority: wallet.publicKey,
              holdingAccount: new PublicKey("F66v9GUTVgG8NLd4ThGMMBt4zsWF74esNZjWUii4JA7A"),
            },
          }
        ))
    let  hmm = await provider.send( tx, [], {skipPreflight: true})
    console.log(hmm)
    
      }
    }
  const { loading, setLoading } = useLoading();

  React.useEffect(() => {
    if (!connection) return;
    setLoading(true);
    const wrap = async () => {
      try {
        const recipeYieldsPromise = getRecipeYields(connection, recipes.map(r => r.mint));

        setRecipeYields(await recipeYieldsPromise);
      } catch (err: any) {
        console.log('Fetch recipe yields err', err);
      }
      setLoading(false);

let provider = new anchor.Provider(connection, (wallet),{})

const idl = await anchor.Program.fetchIdl(new PublicKey("84zHEoSwTo6pb259RtmeYQ5KNStik8pib815q7reZjdx"), provider);

const program = new anchor.Program(idl as anchor.Idl, new PublicKey("84zHEoSwTo6pb259RtmeYQ5KNStik8pib815q7reZjdx"), provider);

const state: any = await program.account.fanout.fetch(new PublicKey("DXNgVF6KaDkkYEjxSFTxKA4qxgW26FsFTFzgJfFDWAWw"));
console.log(state.accountKey.toBase58())
console.log(state)
setState(state)
    };
    wrap();
  }, [!connection, recipeKey.toBase58()]);

  React.useEffect(() => {
    if (!anchorWallet) {
      setIngredients([])
      setRelevantMints([]);
      setExplicitMints({});
      return;
    }
    if (!connection || !program) return;
    setLoading(true);
    try {
      const wrap = async () => {
        try {
          const relevantMintsPromise = fetchRelevantMints(
              anchorWallet, program, connection, recipeKey);

          const relevantMintsRes = await relevantMintsPromise;

          if (!relevantMintsRes) {
            notify({
              message: `Failed fetching wallet mints`,
            });
            setLoading(false);
            return;
          }

          const { ingredientList, onChainIngredients, relevantMints } = relevantMintsRes;

          setIngredientList(ingredientList);//ingredientList
          setIngredients(onChainIngredients)//onChainIngredients
          setRelevantMints(relevantMints);
          setExplicitMints({});
        } catch (err: any) {
          console.log('Fetch relevant mints err', err);
        }
        setLoading(false);
      };
      wrap();
    } catch (err: any) {
      console.log('Key decode err', err);
      setLoading(false);
    }
  }, [anchorWallet?.publicKey, !program, !connection, recipeKey.toBase58()]);


  const addIngredient = async (e : React.SyntheticEvent, ingredient: string, mint: PublicKey) => {
    // TODO: less hacky. let the link click go through
    if ((e.target as any).href !== undefined) {
      return;
    } else {
      e.preventDefault();
    }

    if (dishIngredients.find(c => c.ingredients.find(i => i === ingredient))) {
      throw new Error(`Ingredient ${ingredient} has already been added to this dish`);
    }

    const match = changeList.find(c => c.ingredient === ingredient);
    if (match) {
      if (match.mint.equals(mint)) return;
      if (match.operation !== 'add') {
        throw new Error(`Internal error: Cannot recover and add a mint`);
      }
      const prev = match.mint.toBase58();
      const next = mint.toBase58();
      notify({
        message: "Dish Changes",
        description: `Replaced ingredient ${prev} with ${next}`,
      });

      match.mint = mint;
    } else {
      setChangeList(
        [
          ...changeList,
          {
            ingredient: ingredient,
            mint: mint,
            operation: IngredientView.add,
          },
        ]
      );
    }
  };

  const recoverIngredient = async (e : React.SyntheticEvent, ingredient : string) => {
    // TODO: less hacky. let the link click go through
    if ((e.target as any).href !== undefined) {
      return;
    } else {
      e.preventDefault();
    }

    const mint = dishIngredients.find(c => c.ingredients.find(i => i === ingredient));
    if (!mint) {
      throw new Error(`Ingredient ${ingredient} is not part of this dish`);
    }

    const match = changeList.find(c => c.ingredient === ingredient);
    if (match) {
      if (match.mint !== mint.mint || match.operation !== 'recover') {
        throw new Error(`Internal error: Cannot recover and add a mint`);
      }
      // already added
    } else {
      setChangeList(
        [
          ...changeList,
          {
            ingredient: ingredient,
            mint: mint.mint,
            operation: IngredientView.recover,
          },
        ]
      );
    }
  };
  const [state, setState] = React.useState<any>()

  const cancelChangeForIngredient = async (e : React.SyntheticEvent, ingredient: string) => {
    // TODO: less hacky. let the link click go through
    if ((e.target as any).href !== undefined) {
      return;
    } else {
      e.preventDefault();
    }

    const newList = [...changeList];
    const idx = newList.findIndex(c => c.ingredient === ingredient);
    if (idx === -1) {
      throw new Error(`Ingredient ${ingredient} is not part of the change-list`);
    }

    newList.splice(idx, 1);
    setChangeList(newList);
  };

  const buildDishChanges = async (e : React.SyntheticEvent, changeList : Array<any>) => {
    e.preventDefault();
    if (!anchorWallet || !program) {
      throw new Error(`Wallet or program is not connected`);
    }

    if (ingredientList.length === 0) {
      throw new Error(`No ingredient list`);
    }

    const startTime = getUnixTs();

    const [dishKey, dishBump] = await PublicKey.findProgramAddress(
      [
        FIREBALL_PREFIX,
        recipeKey.toBuffer(),
        anchorWallet.publicKey.toBuffer(),
      ],
      FIREBALL_PROGRAM_ID,
    );

    const setup : Array<TransactionInstruction> = [];

    const dishAccount = await connection.getAccountInfo(dishKey);
    if (dishAccount === null) {
      setup.push(await program.instruction.startDish(
        dishBump,
        {
          accounts: {
            recipe: recipeKey,
            dish: dishKey,
            payer: anchorWallet.publicKey,
            systemProgram: SystemProgram.programId,
          },
          signers: [],
          instructions: [],
        }
      ));
    }

    console.log('Finished finding dish', getUnixTs() - startTime);

    const storeKeysAndBumps = await Promise.all(ingredientList.map(
      (_, idx) => {
        const ingredientNum = new BN(idx);
        return PublicKey.findProgramAddress(
          [
            FIREBALL_PREFIX,
            dishKey.toBuffer(),
            Buffer.from(ingredientNum.toArray('le', 8)),
          ],
          FIREBALL_PROGRAM_ID,
        );
      }
    ));
    const storeAccounts = await (connection as any).getMultipleAccountsInfo(
        storeKeysAndBumps.map(s => s[0]));
    console.log('Finished fetching stores', getUnixTs() - startTime);

    const recipeData = await program.account.recipe.fetch(recipeKey) as any;

    for (let idx = 0; idx < ingredientList.length; ++idx) {
      const group = ingredientList[idx];
      const change = changeList.find(c => c.ingredient === group.ingredient);

      if (!change) {
        continue;
      }

      const ingredientNum = new BN(idx);
      const [storeKey, storeBump] = storeKeysAndBumps[idx];
      const storeAccount = storeAccounts[idx];
      if (change.operation === IngredientView.add) {
        if (storeAccount === null) {
          // nothing
        } else {
          throw new Error(`Ingredient ${group.ingredient} has already been added to this dish`);
        }

        const relevantMint = relevantMints.find(c => c.mint.equals(change.mint));
        if (!relevantMint) {
          throw new Error(`Could not find wallet mint matching ${relevantMint}`);
        }

        // TODO: cache?
        const mintsKeys = group.mints.map(m => new PublicKey(m));
        const mintIdx = mintsKeys.findIndex(m => m.equals(change.mint));
        const parentIdx = relevantMint.parent
          ? mintsKeys.findIndex(m => m.equals(relevantMint.parent?.masterMint))
          : -1;
        if (mintIdx === -1 && parentIdx == -1) {
          const changeMint = change.mint.toBase58();
          throw new Error(`Could not find mint matching ${changeMint} in ingredient group ${group.ingredient}`);
        }

        const dataFlags = mintsKeys.map((m, idx) => {
          return group.allowLimitedEditions && group.allowLimitedEditions[idx] ? 0x02 : 0x00;
        });
        const tree = new MerkleTree(
          mintsKeys.map(m => m.toBuffer()),
          dataFlags,
        );

        if (!Buffer.from(recipeData.roots[idx]).equals(tree.getRoot())) {
          throw new Error(`Merkle tree for ingredient ${group.ingredientMint} does not match chain`);
        }

        const remainingAccounts : Array<AccountMeta> = [];
        let proof, ingredientMint;
        if (mintIdx !== -1) {
          proof = tree.getProof(mintIdx);
          ingredientMint = change.mint;
        } else {
          if (!relevantMint.parent) { // typescript...
            throw new Error(`internal error: inconsistent parent state`);
          }
          proof = tree.getProof(parentIdx);
          ingredientMint = relevantMint.parent.masterMint;
          remainingAccounts.push(
            {pubkey: change.mint, isSigner: false, isWritable: false},
            {pubkey: relevantMint.parent.edition, isSigner: false, isWritable: false},
            {pubkey: relevantMint.parent.masterEdition, isSigner: false, isWritable: false},
          );
        }

        if (!tree.verifyProof(mintIdx !== -1 ? mintIdx : parentIdx, proof, tree.getRoot())) {
          throw new Error(`Invalid ingredient ${change.mint.toBase58()}: bad merkle proof`);
        }

        setup.push(await program.instruction.addIngredient(
          storeBump,
          ingredientNum,
          proof,
          {
            accounts: {
              recipe: recipeKey,
              dish: dishKey,
              ingredientMint,
              ingredientStore: storeKey,
              payer: anchorWallet.publicKey,
              from: relevantMint.tokenAccount,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
            },
            remainingAccounts,
            signers: [],
            instructions: [],
          }
        ));
      } else if (change.operation === IngredientView.recover) {
        if (storeAccount === null) {
          throw new Error(`Ingredient ${group.ingredient} is not in this dish`);
        }

        const walletATA = await getAssociatedTokenAccount(
          anchorWallet.publicKey, change.mint);

        if (!await connection.getAccountInfo(walletATA)) {
          setup.push(Token.createAssociatedTokenAccountInstruction(
            SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            change.mint,
            walletATA,
            anchorWallet.publicKey,
            anchorWallet.publicKey
          ));
        }

        setup.push(await program.instruction.removeIngredient(
          storeBump,
          ingredientNum,
          {
            accounts: {
              dish: dishKey,
              ingredientMint: change.mint,
              ingredientStore: storeKey,
              payer: anchorWallet.publicKey,
              to: walletATA,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
            },
            signers: [],
            instructions: [],
          }
        ));
      } else {
        throw new Error(`Unknown change operation ${change.operation}`);
      }
    }

    console.log('Finished building instrs', getUnixTs() - startTime);

    return setup;
  };


  const submitDishChanges = async (e : React.SyntheticEvent) => {
    if (!program || !anchorWallet) {
      // duplicated in buildDishChanges...
      throw new Error(`Wallet or program is not connected`);
    }
    const setup = await buildDishChanges(e, changeList);
    console.log(setup);
    if (setup.length === 0) {
      notify({
        message: `No Dish changes found`,
      });
      return;
    }

    console.log(setup);

    const instrsPerTx = 2; // TODO: adjust based on proof size...
    const chunked = chunks(setup, instrsPerTx);
    let failed = false;
    await Connection.sendTransactions(
      program.provider.connection,
      anchorWallet,
      chunked,
      new Array<Keypair[]>(chunked.length).fill([]),
      Connection.SequenceType.StopOnFailure,
      'singleGossip',
      // success callback
      (txid: string, ind: number) => {
        notify({
          message: `Dish Changes succeeded: ${ind + 1} of ${chunked.length}`,
          description: (
            <HyperLink href={explorerLinkFor(txid, connection)}>
              View transaction on explorer
            </HyperLink>
          ),
        });
      },
      // failure callback
      (reason: string, ind: number) => {
        console.log(`Dish Changes failed on ${ind}: ${reason}`);
        failed = true;
        return true;
      },
    );

    if (failed) {
      throw new Error(`One of the dish changes failed. See console logs`);
    }

    const [ingredients, relevantMints] = await fetchWalletIngredients(
        connection, recipeKey, anchorWallet.publicKey, ingredientList);

    setIngredients(ingredients);
    setRelevantMints(relevantMints);
    setChangeList([]);
    setExplicitMints({});
  };

  const mintRecipe = async (
    e : React.SyntheticEvent,
    masterMintKey : PublicKey,
    changeList : Array<any>,
  ) => {
    // TODO: less hacky. let the link click go through
    if ((e.target as any).href !== undefined) {
      return;
    } else {
      e.preventDefault();
    }

    if (!anchorWallet || !program) {
      throw new Error(`Wallet or program is not connected`);
    }


    const [dishKey, ] = await PublicKey.findProgramAddress(
      [
        FIREBALL_PREFIX,
        recipeKey.toBuffer(),
        anchorWallet.publicKey.toBuffer(),
      ],
      FIREBALL_PROGRAM_ID,
    );

    const [recipeMintOwner, recipeMintBump] = await PublicKey.findProgramAddress(
      [
        FIREBALL_PREFIX,
        recipeKey.toBuffer(),
      ],
      FIREBALL_PROGRAM_ID
    );

    const recipeATA = await getAssociatedTokenAccount(
        recipeMintOwner, masterMintKey);

    const recipeData = await program.account.recipe.fetch(recipeKey) as any;

    const newMint = Keypair.generate();
    const newMetadataKey = await getMetadata(newMint.publicKey);
    const masterMetadataKey = await getMetadata(masterMintKey);
    const newEdition = await getEdition(newMint.publicKey);
    const masterEdition = await getEdition(masterMintKey);

    const setup : Array<TransactionInstruction> = [];
    await createMintAndAccount(connection, anchorWallet.publicKey, newMint.publicKey, setup);

    const masterEditionAccount = await connection.getAccountInfo(masterEdition);
    if (masterEditionAccount === null) {
      throw new Error(`Could not retrieve master edition for mint ${masterMintKey.toBase58()}`);
    }
    const masterEditionDecoded = decodeMasterEdition(masterEditionAccount.data);

    // TODO: less naive?
    const masterEditionSupply = new BN(masterEditionDecoded.supply);
    const edition = masterEditionSupply.add(new BN(1));
    if (!masterEditionDecoded.maxSupply) {
      // no limit. try for next
    } else {
      const maxSupply = new BN(masterEditionDecoded.maxSupply);
      if (edition.gt(maxSupply)) {
        const masterMintStr = masterMintKey.toBase58();
        throw new Error(`No more editions remaining for ${masterMintStr}`);
      }
    }

    const editionMarkKey = await getEditionMarkerPda(masterMintKey, edition);

    setup.push(await program.instruction.makeDish(
      recipeMintBump,
      edition, // edition
      {
        accounts: {
          recipe: recipeKey,
          dish: dishKey,
          dev: new PublicKey("KWSCV4gVikpfupnu5XrT9c8U2JCxvSENTmArTocxFEB"),
          payer: anchorWallet.publicKey,
          metadataNewMetadata: newMetadataKey,
          metadataNewEdition: newEdition,
          metadataMasterEdition: masterEdition,
          metadataNewMint: newMint.publicKey,
          metadataEditionMarkPda: editionMarkKey,
          metadataNewMintAuthority: anchorWallet.publicKey,
          metadataMasterTokenOwner: recipeMintOwner,
          metadataMasterTokenAccount: recipeATA,
          metadataNewUpdateAuthority: recipeData.authority,
          metadataMasterMetadata: masterMetadataKey,
          metadataMasterMint: masterMintKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        },
        signers: [],
        instructions: [],
      }
    ));

    const dishChanges = await buildDishChanges(e, changeList);
    const txs = [...dishChanges.map(ix => [ix]), setup];
    const signers = new Array<Keypair[]>(txs.length).fill([]);
    signers[signers.length - 1] = [newMint];
    let failed = false;
    await Connection.sendTransactions(
      program.provider.connection,
      anchorWallet,
      txs,
      signers,
      Connection.SequenceType.StopOnFailure,
      'singleGossip',
      // success callback
      (txid: string, ind: number) => {
        const message =
          ind + 1 < txs.length
          ? `Dish Changes succeeded: ${ind + 1} of ${txs.length - 1}`
          : `Mint succeeded!`;
          notify({
            message,
            description: (
              <HyperLink href={explorerLinkFor(txid, connection)}>
                View transaction on explorer
              </HyperLink>
            ),
          });
      },
      // failure callback
      (reason: string, ind: number) => {
        console.log(`Mint failed on ${ind}: ${reason}`);
        failed = true;
        return true;
      },
    );

    if (failed) {
      throw new Error(`One of the mint instructions failed. See console logs`);
    }

    setRecipeYields(await getRecipeYields(connection, recipes.map(r => r.mint)));

    const [ingredients, relevantMints] = await fetchWalletIngredients(
        connection, recipeKey, anchorWallet.publicKey, ingredientList);

    setIngredients(ingredients);
    setRelevantMints(relevantMints);
    setChangeList([]);
    setExplicitMints({});
  };


  const explorerLinkForAddress = (key : PublicKey, shorten: boolean = true) => {
    return (
      <HyperLink
        href={`https://explorer.solana.com/address/${key.toBase58()}?cluster=${envFor(connection)}`}
        target="_blank"
        rel="noreferrer"
        title={key.toBase58()}
        underline="none"
        sx={{ fontFamily: 'Monospace' }}
      >
        {shorten ? shortenAddress(key.toBase58()) : key.toBase58()}
      </HyperLink>
    );
  };

  const batchChangeWrapper = (
    inBatch : boolean,
    r : RelevantMint,
    ingredient : string,
    operation : IngredientView,
  ) => {
    return e => {
      setLoading(true);
      const wrap = async () => {
        console.log(inBatch, r, ingredient, operation);
        try {
          if (inBatch) {
            await cancelChangeForIngredient(e, ingredient);
          } else if (operation === 'add') {
            await addIngredient(e, ingredient, r.mint);
          } else if (operation === 'recover') {
            await recoverIngredient(e, ingredient);
          } else {
            // TODO: error earlier...
            throw new Error(`Unknown operation ${operation}`);
          }
          setLoading(false);
        } catch (err: any) {
          notify({
            message: `${inBatch ? 'Cancel of ' : ''} ${capitalize(operation)} ingredient failed`,
            description: `${err}`,
          });
          setLoading(false);
        }
      };
      wrap();
    };
  };

  // TODO: more robust
  const maxWidth = 1440;
  const outerPadding = 96 * 2;
  const columnsGap = 40;
  const maxColumns = 4;
  const columnWidth = (maxWidth - outerPadding - columnsGap * (maxColumns - 1)) / maxColumns;

  const tilePadding = 0;
  const imageWidth = columnWidth - tilePadding * 2;

  const { width } = useWindowDimensions();
  const sizedColumns = (width : number) => {
           if (width > columnWidth * 4 + columnsGap * 3 + outerPadding) {
      return 4;
    } else if (width > columnWidth * 3 + columnsGap * 2 + outerPadding) {
      return 3;
    } else if (width > columnWidth * 2 + columnsGap * 1 + outerPadding) {
      return 2;
    } else {
      return 1;
    }
  };
  const cols = sizedColumns(width);
  const topDisabled = !anchorWallet || !program || loading;

  const imgBorderStyle = {
    borderRadius: "5px",
    padding: 2,
    backgroundColor: "#888",
  };

  const onCraft = (recipe) => {
    return e => {
      setLoading(true);
      const wrap = async () => {
        try {
          const newIngredients = Object.keys(ingredients).reduce(
            (acc, ingredient) => {
              if (dishIngredients.find(c => c.ingredients.find(i => i === ingredient))) {
                return acc;
              }

              const selectedMint = explicitMints[ingredient] || implicitMints[ingredient];
              let m: RelevantMint;
              if (selectedMint) {
                const selected = relevantMints.find(s => s.mint.equals(selectedMint));
                if (!selected) {
                  throw new Error(`You don't have ingredient ${ingredient}`);
                }
                m = selected;
              } else {
                throw new Error(`You don't have ingredient ${ingredient}`);
              }
              return {
                ...acc,
                [ingredient]: {
                  ingredient,
                  mint: m.mint,
                  operation: IngredientView.add,
                },
              };
            },
            {}
          );
          setChangeList(Object.values(newIngredients));
          await mintRecipe(e, recipe.mint, Object.values(newIngredients));
          setLoading(false);
        } catch (err: any) {
          notify({
            message: `Mint failed`,
            description: err.message,
          });
          setChangeList([]);
          setLoading(false);
        }
      };
      wrap();
    }
  };

  const craftButtonC = (recipe, disabled, buttonStyle = {}) => {
    return (
      <Tooltip
        title={(
          <div>
            Craft with the first {numIngredients} ingredients found in your
            wallet. Pick and choose specific ingredients below!
          </div>
        )}
      >
        <span>
        <Button
          style={{
            ...buttonStyle,
            borderRadius: "30px",
            height: "45px",
            color: disabled ? "gray" : "white",
            borderColor: disabled ? "gray" : "white",
          }}
          disabled={disabled}
          onClick={onCraft(recipe)}
        >
          Craft
        </Button>
        </span>
      </Tooltip>
    );
  };


  const singleYieldC = () => {
    if (recipes.length !== 1) {
      throw new Error(`internal error: expected exactly 1 yield for this view`);
    }
    const recipe = recipes[0];
    const recipeYieldAvailable = recipeYields.find(y => y.mint.equals(recipe.mint));
    const actualColumnWidth = (Math.min(width, maxWidth) - outerPadding - columnsGap * (cols - 1)) / cols;
    return (
      <React.Fragment>
        <p className={"text-title"}>{recipe.name}</p>
        <p className={"text-subtitle"}>
         hmm.. 
        </p>
       
        <Box style={{ height: '10px' }} />
        <Stack
          direction={cols > 1 ? "row" : "column"}
          spacing={0}
        >
          <CachedImageContent
            uri={recipe.image}
            className={"fullAspectRatio"}
            style={{
              ...(cols > 1 ? { maxWidth: actualColumnWidth } : {}),
              minWidth: actualColumnWidth,
            }}
          />
          <Stack
            spacing={1}
            style={{
              ...(cols > 3 ? { paddingRight: '200px' } : {}),
              ...(
                cols > 1
                ? { paddingLeft: `${columnsGap}px` }
                : { paddingTop: '20px', paddingBottom: '20px', }
              ),
            }}
          >
            <div>
              <p
                className={"text-subtitle"}
                style={{ fontSize: '15px' }}
              >
                {recipeYieldAvailable?.description}
              </p>
            </div>
            <div>
              {explorerLinkForAddress(recipe.mint)}
            </div>
            <div>
            {recipeYieldAvailable && (
              <p
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: "10px",
                  color: "gray",
                  lineHeight: "normal",
                }}
              >
                {remainingText(recipeYieldAvailable)}
              </p>
            )}
            </div>
            <div>
            {
           
            //craftButtonC(recipe, topDisabled || !recipeYieldAvailable)
          }
            </div>
          </Stack>
        </Stack>
      </React.Fragment>
    );
  };

  const multipleYieldC = () => (
    <React.Fragment>
      <p className={"text-subtitle"}>
        <div>
         Imagine up new images for your staccs....
        </div>
      </p>
      <Box style={{ height: '10px' }} />
      <ImageList cols={cols} gap={columnsGap}>
        {recipes.map((r, idx) => {
          const recipeYieldAvailable = recipeYields.find(y => y.mint.equals(r.mint));
          return (
            <div
              key={idx}
            >
              <ImageListItem>
                <CachedImageContent
                  uri={r.image}
                  className={"fullAspectRatio"}
                />
                <ImageListItemBar
                  title={r.name}
                  subtitle={(
                    <div>
                      {explorerLinkForAddress(r.mint)}
                    </div>
                  )}
                  position="below"
                />
                {recipeYieldAvailable && (
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      marginBottom: "10px",
                      color: "gray",
                      lineHeight: "normal",
                    }}
                  >
                    {remainingText(recipeYieldAvailable)}
                  </p>
                )}
                {craftButtonC(r, topDisabled || !recipeYieldAvailable)}
              </ImageListItem>
            </div>
          );
        })}
      </ImageList>
    </React.Fragment>
  );

  // TODO: lift wording
  return (
    <Stack
      spacing={1}
    >
      {recipes.length > 1 ? multipleYieldC() : singleYieldC()}

      <Box style={{ height: '20px' }} />

      <div className={"row"}>
        <p className={"text-title"}>Your NFTs</p>
        <div className={"unlock-nft"}>
          <p className={"unlock-text"}>
            {`${collected}/${Object.keys(ingredients).length} NFTs collected`}
          </p>
        </div>
      </div>
      <p className={"text-subtitle"}>The NFTs you have collected.</p>
      <Tooltip
        title="Manually add or remove ingredients by selecting mints"
        style={{
          maxWidth: "300px",
        }}
      >
        <span> { false && 
        <Button
          style={{
            width: "100%",
            borderRadius: "30px",
            height: "30px",
            color: topDisabled ? "gray" : "white",
            borderColor: topDisabled ? "gray" : "white",
          }}
          disabled={topDisabled}
          onClick={e => {
            setLoading(true);
            const wrap = async () => {
              try {
                await submitDishChanges(e);
                setLoading(false);
              } catch (err: any) {
                console.log(err);
                notify({
                  message: `Dish Changes failed`,
                  description: err.message,
                });
                setLoading(false);
              }
            };
            wrap();
          }}
        >
          Change Ingredients
        </Button> }
        </span>
      </Tooltip>

      <ImageList
        cols={cols}
        gap={columnsGap}
        style={{
          paddingTop: '20px',
        }}
      >
        {relevantMints.map((i, idx) => {
let ingredient = "Burn # " + idx.toString()
          const dishIngredient = dishIngredients.find(c => c.ingredients.find(i => i === ingredient));
          const selectedMint = explicitMints[ingredient] || implicitMints[ingredient];

          const otherMints = relevantMints.filter(
            c => {
              // not explicitly selected
              return !Object.values(explicitMints).find(m => m.equals(c.mint))
                // or implicitly assigned to another group
                && !Object.values(implicitMints).find(m => m?.equals(c.mint))
                // and matches the ingredient
                && c.ingredients.find(i => i === ingredient);
            });
          let imgStyle: React.CSSProperties;
          if (dishIngredient || selectedMint) {
            imgStyle = {}
          } else {
            imgStyle = { filter: "grayscale(100%)", };
          }

          let displayMint: RelevantMint | null;
          let operation: IngredientView;
          if (dishIngredient) {
            displayMint = dishIngredient;
            operation = IngredientView.recover;
          } else if (selectedMint) {
            displayMint = relevantMints.find(c => c.mint.equals(selectedMint)) || null;
            operation = IngredientView.add;
          } else {
            displayMint = null;
            operation = IngredientView.add;
          }
          displayMint= i
          const inBatch = changeList.find(
              c => displayMint && c.mint.equals(displayMint.mint) && c.ingredient === ingredient && c.operation === operation);
          return (
            <div
              key={idx}
              style={{
                minWidth: columnWidth,
              }}
            >
              <ImageListItem>
                <CachedImageContent
                  uri={relevantMints[idx] ? relevantMints[idx].uri : ingredients[ingredient]}
                  style={{
                    ...imgBorderStyle,
                    padding: inBatch ? 10 : imgBorderStyle.padding,
                    backgroundColor: dishIngredient ? "#2D1428" : imgBorderStyle.backgroundColor,
                    ...imgStyle,
                  }}
                />
                <br/>
                <ImageListItemBar
                  title={(
                    <div
                      style={{
                        maxWidth: columnWidth
                            ,
                          overflow: 'wrap',
                      }}
                    >
                      {ingredient}
                    </div>
                  )}
                  subtitle={
                    displayMint
                      ? (
                        <div>
                          {dishIngredient && (
                            <Tooltip
                              title="Added for Crafting"
                            >
                            <Chip
                              label="Added"
                              size="small"
                              style={{
                                background: "#4E2946",
                                color: "white",
                              }}
                            />
                            </Tooltip>
                          )}
                        </div>
                      )
                      : <p style={{ fontFamily: 'Monospace' }}>{"\u00A0"}</p>
                  }
                  
                  actionIcon={
                    <div style={{ paddingTop: "6px", paddingBottom: "12px" }}>
                      {!dishIngredient && otherMints.length > 0 && (
                        <React.Fragment>
                          <IconButton
                            style={{
                              color: "white",
                            }}
                            onClick={() => {
                              setExplicitMints({
                                ...explicitMints,
                                [ingredient]: otherMints[0].mint,
                              });
                            }}
                          >
                            <ChevronRightIcon />
                          </IconButton>
                        </React.Fragment>
                      )}
                       
                      <IconButton
                        style={{
                          color: !displayMint ? "gray" : "white",
                        }}
                        disabled={!displayMint}
                        onClick={batchChangeWrapper(inBatch, displayMint as RelevantMint, ingredient, operation)}
                      >
                        {!inBatch ? (operation == IngredientView.add ? <AddIcon /> : <RemoveIcon />)
                                  : <CancelIcon />}
                      </IconButton>
                    </div>
                  }
                  position="below"
                />
                {state && state.traitOptions.map((t: string, i: number ) => 
                                          <div key={i} style={{
                                            overflow:"wrap",
                                            marginTop: "6px", 
                                            color: !displayMint ? "gray" : "white",
                                          }}>     <React.Fragment >
<form className="w-full max-w-lg">
          <div className="w-full mb-6">
          
            <input
              className="w-full mb-6"
              name="grid-first-name"
              style={{color:"black"}}
              type="text"
              placeholder="Set your prompt..."
              onChange={(e) => {
                setPrompt(e.target.value)
              }}
            />
          </div>
          </form>
                        <IconButton
                             style={{
                              overflow:"wrap",
                              marginTop: "6px", 
                              color: !displayMint ? "gray" : "white",
                            }}
                            disabled={!displayMint}
                          onClick={async () =>
                             distributeShare(idx, i, ingredient)
                          }
                        >
                          Doit! {state.shares[i].toNumber() / 10 ** (6 as number)}$
                        </IconButton>
                        </React.Fragment></div>
                        )} 
              </ImageListItem>
            </div>
          );
        })}
      </ImageList>
    </Stack>
  );
};

