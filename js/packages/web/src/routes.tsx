import React from 'react';
import { BrowserRouter, Route, Switch, withRouter } from 'react-router-dom';

import { PublicKey } from '@solana/web3.js';

import { Providers } from './providers';
import { AppLayout } from './components/Layout';
import { FireballView } from "./views/fireballView";
import { SwapView } from './views/SwapView';
import { ExploreView } from "./views/exploreView";

const ScrollToTop = ({ history }) => {
  React.useEffect(() => {
    const unlisten = history.listen(() => {
      window.scrollTo(0, 0);
    });
    return () => {
      unlisten();
    }
  }, []);

  return null;
}

const RouterScrollToTop = withRouter(ScrollToTop);

export function Routes() {
  const ingredients = [
    {
      name: 'Burn # 1',
      image: 'https://www.arweave.net/iesEFWEgMkBmQcIdbNOWxPur7mvOzX2eYKYFwyrUpOE?ext=png',
      video: 'https://www.arweave.net/iesEFWEgMkBmQcIdbNOWxPur7mvOzX2eYKYFwyrUpOE?ext=png',
      glb: 'https://www.arweave.net/iesEFWEgMkBmQcIdbNOWxPur7mvOzX2eYKYFwyrUpOE?ext=png',
      metadata: 'https://arweave.net/Lc2KLnEy6Gdl4yMFjbRo0t4VT5PKQHNFNYL1ZUmlfgQ'
    },
    {
      name: 'Burn # 2',
      image: 'https://www.arweave.net/naodkFxys0O6GjRKZVH4mLe7jaItKdhx4jMyO97SNXA?ext=png',
      video: 'https://www.arweave.net/naodkFxys0O6GjRKZVH4mLe7jaItKdhx4jMyO97SNXA?ext=png',
      glb: 'https://www.arweave.net/naodkFxys0O6GjRKZVH4mLe7jaItKdhx4jMyO97SNXA?ext=png',
      metadata: 'https://arweave.net/XP_0VpxAUODcfV2W284u_0QnY2LAll_8kFy-opKsvWg'
    },
    {
      name: 'Burn # 3',
      image: 'https://www.arweave.net/200wrfX-LVTiG4_L6MB8i_In2F0jbCPT55YHhLRjWAQ?ext=png',
      video: 'https://www.arweave.net/200wrfX-LVTiG4_L6MB8i_In2F0jbCPT55YHhLRjWAQ?ext=png',
      glb: 'https://www.arweave.net/200wrfX-LVTiG4_L6MB8i_In2F0jbCPT55YHhLRjWAQ?ext=png',
      metadata: 'https://arweave.net/jLnCaiUEcVztoIvNh-AuXWaTcaEvrGESKiWyrEph8UI'
    }, {
      name: 'Burn # 4',
      image: 'https://www.arweave.net/OjiLOYE1EIRxIBRfNoiruFk1QchImJ2dEIRAQ8bFEoY?ext=png',
      video: 'https://www.arweave.net/OjiLOYE1EIRxIBRfNoiruFk1QchImJ2dEIRAQ8bFEoY?ext=png',
      glb: 'https://www.arweave.net/OjiLOYE1EIRxIBRfNoiruFk1QchImJ2dEIRAQ8bFEoY?ext=png',
      metadata: 'https://arweave.net/0WBNAgcbmYjQIj_scyiQbCJFoNI4GC6dPotXPZHmDx4'
    },
    {
      name: 'Burn # 5',
      image: 'https://www.arweave.net/z26zyp9FLKHglO_JL6wog5Owj1Md2_JK4h9eZ1fCImc?ext=png',
      video: 'https://www.arweave.net/z26zyp9FLKHglO_JL6wog5Owj1Md2_JK4h9eZ1fCImc?ext=png',
      glb: 'https://www.arweave.net/z26zyp9FLKHglO_JL6wog5Owj1Md2_JK4h9eZ1fCImc?ext=png',
      metadata: 'https://arweave.net/l-m8kLoNBRaqxZcG-2BeBlN5ND3AHoWVdhNgJAymGIw'
    },
    {
      name: 'Burn # 6',
      image: 'https://www.arweave.net/8V954G7MaJJuKvHPJZqdwE3GNm9a5N_r66Nt-RUoWdc?ext=png',
      video: 'https://www.arweave.net/8V954G7MaJJuKvHPJZqdwE3GNm9a5N_r66Nt-RUoWdc?ext=png',
      glb: 'https://www.arweave.net/8V954G7MaJJuKvHPJZqdwE3GNm9a5N_r66Nt-RUoWdc?ext=png',
      metadata: 'https://arweave.net/QdKA1dRhPp4QqH4j1AzrChzj1LRSqtc6Ur6iRp4hsJ8'
    },
    {
      name: 'Burn # 7',
      image: 'https://www.arweave.net/7ih3DhJJ1IYsAOmkArYl_yhLnWjc0bc2OAlPjMthAn8?ext=png',
      video: 'https://www.arweave.net/7ih3DhJJ1IYsAOmkArYl_yhLnWjc0bc2OAlPjMthAn8?ext=png',
      glb: 'https://www.arweave.net/7ih3DhJJ1IYsAOmkArYl_yhLnWjc0bc2OAlPjMthAn8?ext=png',
      metadata: 'https://arweave.net/kdc_x-qNr5tioeKiFep9Cn6xx0NOPnpTxxm9s0owL5U'
    }
  ]

  const reduceIngredients = (v) => {
    return v.reduce((acc, i) => ({ ...acc, [i.name]: i.image }), {});
  };

  const ingredientMatching = (name: string) => {
    const res = ingredients.find(i => i.name === name);
    if (!res) throw new Error(`ingredient ${name} not found`);
    return res;
  };

  const ingredientSubset = (subset : Array<string>) => {
    return reduceIngredients(ingredients
      .filter(i => { return subset.includes(i.name); }));
  };

  const pathForYield = (y) => {
    return '/' + y.name.replaceAll(' ', '');
  };

  const cityYields = [
    {
      image: "https://4udejsogpoo3ekjmiigzgcgzyebntokt6oqavvw5vsv77xpvp5eq.arweave.net/5QZEycZ7nbIpLEINkwjZwQLZuVPzoArW3ayr_931f0k/?ext=gif",
      name: "red moon city",
      mint: new PublicKey("2gFFVAaFQe36FTBevz2cQHivXUfPse53dBSN65e96HND"),
    },
    {
      image: "https://pvibl5h2u52szj5hq5h4pselyzhjsckz53oziusek2insn4f75va.arweave.net/fVAV9PqndSynp4dPx8iLxk6ZCVnu3ZRSRFaQ2TeF_2o/?ext=gif",
      name: "blue moon beach",
      mint: new PublicKey("9vpjkWrc4GSW98HgrTZaknHKtxdrx7Cq6P6is4A7uwE1"),
    },
    {
      image: "https://u2pr74tvgu2uxgvscxk22my5b6o5esatoqgcv5npyfaaef37tv3a.arweave.net/pp8f8nU1NUuashXVrTMdD53SSBN0DCr1r8FAAhd_nXY/?ext=gif",
      name: "once in a solana moon",
      mint: new PublicKey("ENSkFqG4unsRq6bFa17vngQ8rfxsVdcvJJijyHdFi2XQ"),
    },
  ];

  const mightyKnightyDuckYields = [
    {
      image: "https://www.arweave.net/UMsb5j6OWgM-JUEeQqYej82kHFDw7GPGA2pzSUkRFdE?ext=gif",
      glb: "https://arweave.net/0SCrB_5BsAZ1f54XD60-SaVn7sqzi6svI96ABWjzIEc",
      name: "mighty knighty duck",
      mint: new PublicKey("2oXhnNh3pAPLBkQJyVceuZHNWkwpM5azKjGfqeBbAF3R"),
    },
  ];

  const apeCyborgYields = [
    {
      image: "https://arweave.net/w2I8pcZ4bRWpDOxxZOFS2CEzgm9GOf9nhVW0ZFNluJU",
      glb: "https://arweave.net/y3i4FA-tzsOxZEV49XMtlfsN3a9Et5PgABczTQHS23w",
      name: "professor ape cyborg",
      mint: new PublicKey("J8nLE658PUcLGU6qecatWweutttC9yofxF4UTeYutUXj"),
    },
  ];

  const deppelinYields = [
    {
      image: "https://arweave.net/TC6GCCkNepHVlNCekaSBbX-a4FVwV3PVBIXixdod34E",
      glb: "https://arweave.net/oL8-wWOC0DLpQUCFXwmA9Kpmu1fAueKHk6KAdn3w6Qk",
      name: "deppelin",
      mint: new PublicKey("BNJwHxo5yP9W77aVrmAehepr1QLRXkBPyEzZqUUisg8o"),
    },
  ];

  const gwendolinYields = [
    {
      image: "https://arweave.net/ksXwJ1HAj1PD7qwFwEGRS84u3VxaqzsXDLTKgPcL6O8",
      glb: "https://arweave.net/fkKWBlxJHW_lF2mt6Iu5KhRydAC5Hx6ZwJ-OZa2VgZw",
      name: "gwendolin",
      mint: new PublicKey("WfN7PjJxiTfsXyo5vycwhr2bYPHwGBFqh6jp8tvtt7o"),
    },
  ];

  const bullduckYields = [
    {
      image: "https://arweave.net/P4i68_4hoN1lImQa5HsIFdcuK5bf6PjjuTNjn_61ZDw",
      glb: "https://arweave.net/64-Lc4TLJX5iyzGR9nS_JEdkDHXhQQ9CawxI8FHkRKY",
      name: "bullduck",
      mint: new PublicKey("73JfKJgE6sKLf2CY5QMSXSsjQWY36buq9eVAJpstjVbt"),
    },
  ];

  const donutterYields = [
    {
      image: "https://arweave.net/otjqC1nnZM4qDJAlYSQejBZ0tygMCah86Av0TSSZJOw",
      glb: "https://arweave.net/4CcgqA857qY1ISr8kJKYvGfDjp9ncrxVwaFMjCjWkg0",
      name: "donutter",
      mint: new PublicKey("FaCwhWFPDAShn9NuFvNSWDJ2jf9CQmVSp1CCYjf1FATi"),
    },
  ];


  const STACCEggYields = [
    {
      image: "https://arweave.net/GlgcAcKaWtYBKAFiUhy3S0eW0hxSUHrePh3FII6fLB4?ext=png",
      glb: "https://arweave.net/GlgcAcKaWtYBKAFiUhy3S0eW0hxSUHrePh3FII6fLB4?ext=png",
      name: "STACCEgg",
      mint: new PublicKey("EdtTmVXaJ52JHHkxH3zbdCZeZpkM7PBEisunA3B3GnSo"),
    },
  ];


  return (
    <>
      <BrowserRouter basename={'/'}>
        <Providers>
        <AppLayout>
          <RouterScrollToTop />
          <Switch>
            <Route path="/collectoooooor" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("HHNbiYDEAJ2PXv5GZXXrn2Ypi1s8CfZK4asgnpg6MSUi")}
                  recipeYields={cityYields}
                  ingredients={reduceIngredients(ingredients)}
                />
              )
            } />
            {cityYields.map((y, idx) => (
              <Route key={idx} path={pathForYield(y)} component={
                () => (
                  <FireballView
                    recipeKey={new PublicKey("HHNbiYDEAJ2PXv5GZXXrn2Ypi1s8CfZK4asgnpg6MSUi")}
                    recipeYields={[y]}
                    ingredients={reduceIngredients(ingredients)}
                  />
                )
              } />
            ))}
            <Route path="/mightyknightyduck" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("HnKE8p6cdcfbn4hZA3wT4YciXvALzmFb9Fc91b74Ka1i")}
                  recipeYields={mightyKnightyDuckYields}
                  ingredients={{
                    ...ingredientSubset(['duck with doughnut', 'normal duck']),
                    "mighty knighty duck recipe": "https://www.arweave.net/5-CbCHZGiLBHwx8GPZx2g8aIvX_5mG_TUpuvoTUo3Lk?ext=png",
                  }}
                />
              )
            } />
            <Route path="/professorapecyborg" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("GUKyCfChES46JJxFv75hKCdhR3qorTkTa5cppU27v9Cp")}
                  recipeYields={apeCyborgYields}
                  ingredients={{
                    ...ingredientSubset(['traincar', 'telescope ape', 'house']),
                  }}
                />
              )
            } />
            <Route path="/deppelin" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("5yLsFHmrUqh1MuC1FMx3jpFudfWJ4vVkiHr7tEgNekjM")}
                  recipeYields={deppelinYields}
                  ingredients={{
                    ...ingredientSubset(['sailboat', 'hot air balloon']),
                  }}
                />
              )
            } />
            <Route path="/gwendolin" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("44h7CvSmWGHfXJTgtEjhxuaxbCXWG9dBUpgXq4Ume7Hs")}
                  recipeYields={gwendolinYields}
                  ingredients={{
                    'gwenda 1': ingredientMatching('umbrella duck').image,
                    'gwenda 2': ingredientMatching('umbrella duck').image,
                    'gwenda 3': ingredientMatching('umbrella duck').image,
                    'gwenda 4': ingredientMatching('umbrella duck').image,
                  }}
                />
              )
            } />
            <Route path="/bullduck" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("BqdskV4Wag7rTBA9ctBogDkmcAfV37LLz9tJqZDB8jd5")}
                  recipeYields={bullduckYields}
                  ingredients={{
                    ...ingredientSubset(['normal duck', 'house', 'bull']),
                  }}
                />
              )
            } />
            <Route path="/donutter" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("F4z65734ohGqJ4yhKbC9U9ZqNW5xcrThcPSJqhiUnWU4")}
                  recipeYields={donutterYields}
                  ingredients={{
                    ...ingredientSubset(['airplane', 'duck with doughnut']),
                  }}
                />
              )
            } />
            <Route path="/STACCEgg" component={
              () => (
                <FireballView
                  recipeKey={new PublicKey("Br1JDGytXh2pFtPHgihTsEgf2gzDZ56osmCZxAtUuAeM")}
                  recipeYields={STACCEggYields}
                  ingredients={{
                    ...ingredientSubset(['Burn # 1','Burn # 2','Burn # 3',
                    'Burn # 4','Burn # 5','Burn # 6','Burn # 7'  ]),
                  }}
                />
              )
            } />
            <Route path="/swap" component={SwapView} />
            <Route path="/" component={
              () => (
                <ExploreView
                  recipeYields={[
                    ...STACCEggYields.map(c => ({ ...c, link: "/STACCEgg" })),
                     /*...STACCEggYields.map(c => ({ ...c, link: "/STACCEgg" }))
                    ...donutterYields.map(c => ({ ...c, link: "/donutter" })),
                    ...bullduckYields.map(c => ({ ...c, link: "/bullduck" })),
                    ...gwendolinYields.map(c => ({ ...c, link: "/gwendolin" })),
                    ...deppelinYields.map(c => ({ ...c, link: "/deppelin" })),
                    ...apeCyborgYields.map(c => ({ ...c, link: "/professorapecyborg" })),
                    ...mightyKnightyDuckYields.map(c => ({ ...c, link: "/mightyknightyduck" })),
                    ...cityYields.map(c => ({ ...c, link: pathForYield(c) })),*/
                  ]}
                  ingredients={ingredients}
                />
              )
            } />
          </Switch>
        </AppLayout>
        </Providers>
      </BrowserRouter>
    </>
  );
}
