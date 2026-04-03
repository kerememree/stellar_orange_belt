#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

const FREIGHTER: Symbol = symbol_short!("freighter");
const XBULL: Symbol = symbol_short!("xbull");

#[contracttype]
pub enum DataKey {
    Count(Symbol),
}

#[contracttype]
pub struct VoteEvent {
    pub option: Symbol,
    pub total: u32,
    pub voter: Address,
}

#[contract]
pub struct YellowBeltPollContract;

#[contractimpl]
impl YellowBeltPollContract {
    pub fn vote(env: Env, voter: Address, option: Symbol) -> u32 {
        voter.require_auth();

        if option != FREIGHTER && option != XBULL {
            panic!("invalid voting option");
        }

        let key = DataKey::Count(option.clone());
        let next_total = env.storage().instance().get::<_, u32>(&key).unwrap_or(0) + 1;

        env.storage().instance().set(&key, &next_total);
        env.events().publish(
            (symbol_short!("poll"), symbol_short!("vote"), option.clone()),
            VoteEvent {
                option,
                total: next_total,
                voter,
            },
        );

        next_total
    }

    pub fn get_freighter_votes(env: Env) -> u32 {
        env.storage()
            .instance()
            .get::<_, u32>(&DataKey::Count(FREIGHTER))
            .unwrap_or(0)
    }

    pub fn get_xbull_votes(env: Env) -> u32 {
        env.storage()
            .instance()
            .get::<_, u32>(&DataKey::Count(XBULL))
            .unwrap_or(0)
    }
}
