import {NextResponse} from 'next/server';

export async function POST(){
 return NextResponse.json({error:'Gebruik je e-mailadres en wachtwoord om in te loggen.'},{status:410});
}
